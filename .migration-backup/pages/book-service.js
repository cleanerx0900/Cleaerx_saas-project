import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";
import { emptyQtys, roomKeys, roomNames } from "../lib/pricing";
import { getContrastText, shade } from "../lib/colorUtils";
import { MASTER_DEFAULTS, ruleValue, TIME_SLOTS } from "../lib/bookingConstants";
import ServiceIcon from "../components/ServiceIcon";

function CenteredMessage({ title, body, color }) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-10 max-w-md text-center border-2" style={{ borderColor: color }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${color}1a` }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color }}>
          {title}
        </h3>
        <p className="text-gray-500 text-sm">{body}</p>
      </div>
    </div>
  );
}

function QtyControl({ value, onChange, min = 0, color = "#0A1F44" }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
        className="w-8 h-8 rounded-lg border flex items-center justify-center transition hover:opacity-80"
        style={{ borderColor: color, color }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || 0))}
        className="w-14 text-center border border-gray-300 rounded-lg py-1 font-semibold outline-none"
        style={{ color }}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition hover:opacity-90"
        style={{ backgroundColor: color }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

export default function BookService() {
  const router = useRouter();
  const { slug } = router.query;

  // Tenant resolution: same slug -> company pattern used by
  // pages/company/[slug]/book.js and pages/company/[slug]/index.js, so this
  // shared booking form can be linked per-company as /book-service?slug=<slug>.
  const [companyState, setCompanyState] = useState("loading"); // loading | ok | not_found | inactive | error
  const [company, setCompany] = useState(null);
  const [companyError, setCompanyError] = useState("");

  // Company-specific pricing, loaded from company_pricing_rules and grouped
  // as { [category]: { [rule_key]: value } }. Never merged with any other
  // company's rows — scoped strictly by company_id.
  const [rulesByCategory, setRulesByCategory] = useState(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState(null);
  const [contactSettings, setContactSettings] = useState(null);

  // ── Theme ────────────────────────────────────────────────────────────────────
  // Derived from loaded company_settings. Falls back to CleanerX defaults while
  // data is loading or when settings are absent from the database.
  const PRIMARY      = contactSettings?.primary_color   || "#0A1F44"
  const SECONDARY    = contactSettings?.secondary_color || "#D4AF37"
  const ACCENT       = contactSettings?.accent_color    || "#F5C518"
  const COMPANY_LOGO = contactSettings?.logo_url        || null
  const PRIMARY_LIGHT = PRIMARY + "1a"          // ~10 % opacity tint for active card backgrounds
  const ON_PRIMARY   = getContrastText(PRIMARY)  // white or dark text for on-primary elements

  useEffect(() => {
    if (!router.isReady) return;
    if (!slug || typeof slug !== "string") {
      setCompanyState("not_found");
      return;
    }

    let cancelled = false;
    async function resolveCompanyAndRules() {
      setCompanyState("loading");
      setRulesLoading(true);
      try {
        // Companies and company_pricing_rules have no anon SELECT policy
        // (same convention as the rest of the public booking flow — see
        // sql/migrations/007_rls_policies.sql), so both are resolved
        // together via a server-side API route using the service role key.
        const res = await fetch(`/api/company-pricing?slug=${encodeURIComponent(slug)}`);
        if (cancelled) return;

        if (res.status === 404) {
          setCompanyState("not_found");
          setRulesLoading(false);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const friendly =
            body.error === "pricing_unavailable"
              ? "We couldn't load this company's pricing right now. Please try again shortly."
              : body.error || `Request failed (${res.status})`;
          setCompanyError(friendly);
          setCompanyState("error");
          setRulesLoading(false);
          return;
        }

        const body = await res.json();
        if (cancelled) return;

        setCompany(body.company);
        setContactSettings(body.settings || null);
        if (!body.company.is_active) {
          setCompanyState("inactive");
          setRulesLoading(false);
          return;
        }
        setCompanyState("ok");

        if (body.rulesError) {
          setRulesError(body.rulesError);
        } else {
          setRulesError(null);
        }
        const grouped = {};
        (body.rules || []).forEach((row) => {
          if (!grouped[row.category]) grouped[row.category] = {};
          grouped[row.category][row.rule_key] = row.value;
        });
        setRulesByCategory(grouped);
        setRulesLoading(false);
      } catch (err) {
        if (cancelled) return;
        setCompanyError(err.message);
        setCompanyState("error");
        setRulesLoading(false);
      }
    }

    resolveCompanyAndRules();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug]);

  // ── Company-specific pricing, computed exactly like lib/pricing.js —
  // same bulk thresholds, same band/tier logic — only the numbers now come
  // from this company's rows (or the master default if a rule is missing).
  const sofaRate = (qty) =>
    qty >= ruleValue(rulesByCategory, "sofa", "bulk_threshold")
      ? ruleValue(rulesByCategory, "sofa", "bulk_rate")
      : ruleValue(rulesByCategory, "sofa", "standard_rate");

  const foamRate = (qty) =>
    qty >= ruleValue(rulesByCategory, "foam", "bulk_threshold")
      ? ruleValue(rulesByCategory, "foam", "bulk_rate")
      : ruleValue(rulesByCategory, "foam", "standard_rate");

  const carpetRate = (sqft) => {
    if (sqft <= 100) return ruleValue(rulesByCategory, "carpet", "band_0_100");
    if (sqft <= 300) return ruleValue(rulesByCategory, "carpet", "band_101_300");
    if (sqft <= 500) return ruleValue(rulesByCategory, "carpet", "band_301_500");
    return ruleValue(rulesByCategory, "carpet", "band_500_plus");
  };

  const mattressSingleRate = (qty) => {
    if (qty > 1) return ruleValue(rulesByCategory, "mattress", "single_bulk");
    if (qty === 1) return ruleValue(rulesByCategory, "mattress", "single_standard");
    return 0;
  };

  const mattressDoubleRate = (qty) => {
    if (qty > 1) return ruleValue(rulesByCategory, "mattress", "double_bulk");
    if (qty === 1) return ruleValue(rulesByCategory, "mattress", "double_standard");
    return 0;
  };

  const curtainPrices = {
    csmall: ruleValue(rulesByCategory, "curtain", "small"),
    cstd: ruleValue(rulesByCategory, "curtain", "standard"),
    clarge: ruleValue(rulesByCategory, "curtain", "large"),
    cblack: ruleValue(rulesByCategory, "curtain", "blackout"),
  };

  const tankBands = {
    500: ruleValue(rulesByCategory, "tank", "band_500"),
    1000: ruleValue(rulesByCategory, "tank", "band_1000"),
    2000: ruleValue(rulesByCategory, "tank", "band_2000"),
    5000: ruleValue(rulesByCategory, "tank", "band_5000"),
  };

  const roomPrices = {
    regular: {
      small: {
        bed: ruleValue(rulesByCategory, "home_regular", "small_bed"),
        lounge: ruleValue(rulesByCategory, "home_regular", "small_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_regular", "small_kitchen"),
        wash: ruleValue(rulesByCategory, "home_regular", "small_wash"),
        garage: ruleValue(rulesByCategory, "home_regular", "small_garage"),
        stair: ruleValue(rulesByCategory, "home_regular", "small_stair"),
        store: ruleValue(rulesByCategory, "home_regular", "small_store"),
      },
      large: {
        bed: ruleValue(rulesByCategory, "home_regular", "large_bed"),
        lounge: ruleValue(rulesByCategory, "home_regular", "large_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_regular", "large_kitchen"),
        wash: ruleValue(rulesByCategory, "home_regular", "large_wash"),
        garage: ruleValue(rulesByCategory, "home_regular", "large_garage"),
        stair: ruleValue(rulesByCategory, "home_regular", "large_stair"),
        store: ruleValue(rulesByCategory, "home_regular", "large_store"),
      },
    },
    deep: {
      small: {
        bed: ruleValue(rulesByCategory, "home_deep", "small_bed"),
        lounge: ruleValue(rulesByCategory, "home_deep", "small_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_deep", "small_kitchen"),
        wash: ruleValue(rulesByCategory, "home_deep", "small_wash"),
        garage: ruleValue(rulesByCategory, "home_deep", "small_garage"),
        stair: ruleValue(rulesByCategory, "home_deep", "small_stair"),
        store: ruleValue(rulesByCategory, "home_deep", "small_store"),
      },
      large: {
        bed: ruleValue(rulesByCategory, "home_deep", "large_bed"),
        lounge: ruleValue(rulesByCategory, "home_deep", "large_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_deep", "large_kitchen"),
        wash: ruleValue(rulesByCategory, "home_deep", "large_wash"),
        garage: ruleValue(rulesByCategory, "home_deep", "large_garage"),
        stair: ruleValue(rulesByCategory, "home_deep", "large_stair"),
        store: ruleValue(rulesByCategory, "home_deep", "large_store"),
      },
    },
  };

  const SERVICES = [
    {
      key: "sofa",
      name: "Sofa Cleaning",
      rate: `1–9 seats: Rs ${ruleValue(rulesByCategory, "sofa", "standard_rate")}/seat · 10+ seats: Rs ${ruleValue(rulesByCategory, "sofa", "bulk_rate")}/seat`,
    },
    {
      key: "foam",
      name: "Foam Chair Cleaning",
      rate: `1–9 chairs: Rs ${ruleValue(rulesByCategory, "foam", "standard_rate")}/chair · 10+ chairs: Rs ${ruleValue(rulesByCategory, "foam", "bulk_rate")}/chair`,
    },
    {
      key: "carpet",
      name: "Carpet Cleaning",
      rate: `Up to 100: Rs ${ruleValue(rulesByCategory, "carpet", "band_0_100")}/sqft · 101–300: Rs ${ruleValue(rulesByCategory, "carpet", "band_101_300")} · 301–500: Rs ${ruleValue(rulesByCategory, "carpet", "band_301_500")} · 500+: Rs ${ruleValue(rulesByCategory, "carpet", "band_500_plus")}`,
    },
    {
      key: "mattress",
      name: "Mattress Cleaning",
      rate: `Single: Rs ${ruleValue(rulesByCategory, "mattress", "single_standard").toLocaleString()} (2+: Rs ${ruleValue(rulesByCategory, "mattress", "single_bulk").toLocaleString()} each) · Double: Rs ${ruleValue(rulesByCategory, "mattress", "double_standard").toLocaleString()} (2+: Rs ${ruleValue(rulesByCategory, "mattress", "double_bulk").toLocaleString()} each)`,
    },
    {
      key: "curtain",
      name: "Curtain Cleaning",
      rate: `Small: Rs ${curtainPrices.csmall.toLocaleString()} · Standard: Rs ${curtainPrices.cstd.toLocaleString()} · Large: Rs ${curtainPrices.clarge.toLocaleString()} · Blackout: Rs ${curtainPrices.cblack.toLocaleString()}`,
    },
    {
      key: "tank",
      name: "Water Tank Cleaning",
      rate: `Up to 500L: Rs ${tankBands[500].toLocaleString()} · 501–1000L: Rs ${tankBands[1000].toLocaleString()} · 1001–2000L: Rs ${tankBands[2000].toLocaleString()} · 2001–5000L: Rs ${tankBands[5000].toLocaleString()}`,
    },
  ];

  function getTotal(sel, qtys, tankSize, regularSize, deepSize) {
    let total = 0;
    if (sel.sofa) total += sofaRate(qtys.sofa) * qtys.sofa;
    if (sel.foam) total += foamRate(qtys.foam) * qtys.foam;
    if (sel.carpet) total += carpetRate(qtys.carpet) * qtys.carpet;
    if (sel.mattress) {
      total += mattressSingleRate(qtys.msingle) * qtys.msingle;
      total += mattressDoubleRate(qtys.mdouble) * qtys.mdouble;
    }
    if (sel.curtain) {
      total +=
        curtainPrices.csmall * qtys.csmall +
        curtainPrices.cstd * qtys.cstd +
        curtainPrices.clarge * qtys.clarge +
        curtainPrices.cblack * qtys.cblack;
    }
    if (sel.tank) total += Number(tankSize) || 0;

    ["regular", "deep"].forEach((type) => {
      if (sel[type]) {
        const size = type === "regular" ? regularSize : deepSize;
        if (size) {
          const p = roomPrices[type][size];
          roomKeys.forEach((rk) => {
            const qkey = `r${rk}-${type}`;
            total += p[rk] * (qtys[qkey] || 0);
          });
        }
      }
    });

    return total;
  }

  function getBillLines(sel, qtys, tankSize, regularSize, deepSize) {
    const lines = [];
    if (sel.sofa) {
      const r = sofaRate(qtys.sofa);
      lines.push({
        label: `🛋️ Sofa Cleaning (${qtys.sofa} seats${qtys.sofa >= 10 ? " — bulk" : ""})`,
        amount: r * qtys.sofa,
      });
    }
    if (sel.foam) {
      const r = foamRate(qtys.foam);
      lines.push({
        label: `🪑 Foam Chair (${qtys.foam} chairs${qtys.foam >= 10 ? " — bulk" : ""})`,
        amount: r * qtys.foam,
      });
    }
    if (sel.carpet) {
      const r = carpetRate(qtys.carpet);
      lines.push({ label: `🏠 Carpet (${qtys.carpet} sqft @ Rs ${r}/sqft)`, amount: r * qtys.carpet });
    }
    if (sel.mattress) {
      if (qtys.msingle > 0) {
        lines.push({ label: `🛏️ Single Mattress ×${qtys.msingle}`, amount: mattressSingleRate(qtys.msingle) * qtys.msingle });
      }
      if (qtys.mdouble > 0) {
        lines.push({ label: `🛏️ Double Mattress ×${qtys.mdouble}`, amount: mattressDoubleRate(qtys.mdouble) * qtys.mdouble });
      }
    }
    if (sel.curtain) {
      if (qtys.csmall > 0) lines.push({ label: `🪞 Small Curtain ×${qtys.csmall}`, amount: curtainPrices.csmall * qtys.csmall });
      if (qtys.cstd > 0) lines.push({ label: `🪞 Standard Curtain ×${qtys.cstd}`, amount: curtainPrices.cstd * qtys.cstd });
      if (qtys.clarge > 0) lines.push({ label: `🪞 Large Curtain ×${qtys.clarge}`, amount: curtainPrices.clarge * qtys.clarge });
      if (qtys.cblack > 0) lines.push({ label: `🪞 Blackout Curtain ×${qtys.cblack}`, amount: curtainPrices.cblack * qtys.cblack });
    }
    if (sel.tank) {
      lines.push({ label: "🪣 Water Tank Cleaning", amount: Number(tankSize) || 0 });
    }
    ["regular", "deep"].forEach((type) => {
      if (sel[type]) {
        const size = type === "regular" ? regularSize : deepSize;
        const label = type === "regular" ? "🧹 Regular" : "✨ Deep";
        if (size) {
          const p = roomPrices[type][size];
          roomKeys.forEach((rk) => {
            const q = qtys[`r${rk}-${type}`] || 0;
            if (q > 0) lines.push({ label: `${label} — ${roomNames[rk]} ×${q}`, amount: p[rk] * q });
          });
        } else {
          lines.push({ label: `${label} Cleaning`, amount: null, note: "Size select karein" });
        }
      }
    });
    return lines;
  }

  const [sel, setSel] = useState({
    sofa: false,
    foam: false,
    carpet: false,
    mattress: false,
    curtain: false,
    tank: false,
    regular: false,
    deep: false,
  });
  const [qtys, setQtys] = useState(emptyQtys);
  const [tankSize, setTankSize] = useState(2500);
  const [regularSize, setRegularSize] = useState("");
  const [deepSize, setDeepSize] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", location: "", date: "" });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Once this company's tank pricing is loaded, keep the default selection
  // in sync with its "Up to 500L" band (same default the form always had).
  useEffect(() => {
    setTankSize(tankBands[500]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesByCategory]);

  const setQty = (key, val) => setQtys((prev) => ({ ...prev, [key]: val }));

  function resetHomeType(type) {
    setQtys((prev) => {
      const next = { ...prev };
      roomKeys.forEach((rk) => {
        next[`r${rk}-${type}`] = 0;
      });
      return next;
    });
    if (type === "regular") setRegularSize("");
    else setDeepSize("");
  }

  function toggleService(key) {
    if (key === "regular" || key === "deep") {
      const other = key === "regular" ? "deep" : "regular";
      setSel((prev) => {
        const turningOn = !prev[key];
        if (turningOn && prev[other]) {
          resetHomeType(other);
        }
        if (!turningOn) {
          resetHomeType(key);
        }
        return { ...prev, [key]: turningOn, [other]: turningOn ? false : prev[other] };
      });
      return;
    }

    setSel((prev) => {
      const turningOn = !prev[key];
      if (!turningOn) {
        const resetMap = {
          sofa: ["sofa"],
          foam: ["foam"],
          carpet: ["carpet"],
          mattress: ["msingle", "mdouble"],
          curtain: ["csmall", "cstd", "clarge", "cblack"],
        };
        if (resetMap[key]) {
          setQtys((q) => {
            const next = { ...q };
            resetMap[key].forEach((qk) => (next[qk] = 0));
            return next;
          });
        }
      }
      return { ...prev, [key]: turningOn };
    });
  }

  const total = useMemo(
    () => getTotal(sel, qtys, tankSize, regularSize, deepSize),
    [sel, qtys, tankSize, regularSize, deepSize, rulesByCategory]
  );
  const billLines = useMemo(
    () => getBillLines(sel, qtys, tankSize, regularSize, deepSize),
    [sel, qtys, tankSize, regularSize, deepSize, rulesByCategory]
  );

  function buildServiceSummary() {
    if (billLines.length === 0) return "";
    return billLines.map((l) => `${l.label}${l.amount != null ? ` — Rs ${l.amount.toLocaleString()}` : ` (${l.note})`}`).join("; ");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    const anySelected = Object.values(sel).some((v) => v);
    if (!anySelected) {
      setMessage("Please select at least one service.");
      return;
    }
    if (!customer.date) {
      setMessage("Please select a preferred date.");
      return;
    }

    setSubmitting(true);
    const summary = `${buildServiceSummary()} | Total: Rs ${total.toLocaleString()} | Customer: ${customer.name || "N/A"} (${customer.phone || "N/A"}) | Address: ${customer.address || "N/A"} | Time: ${selectedTime || "N/A"}`;

    const { error } = await supabase.from("bookings").insert([
      {
        company_id: company.id,
        service: summary,
        booking_date: customer.date,
        status: "pending",
        customer_name: customer.name || null,
        customer_phone: customer.phone || null,
        customer_address: customer.address || null,
      },
    ]);

    setSubmitting(false);

    if (error) {
      setMessage("Error: " + error.message);
    } else {
      setSuccess(true);
      setMessage("");
    }
  }

  // This company's own WhatsApp number, loaded live from company_settings
  // via /api/company-pricing — there is no hardcoded/shared fallback
  // number anywhere in this form.
  const whatsappDigits = (contactSettings?.whatsapp_number || "").replace(/[^\d]/g, "");
  const hasWhatsapp = whatsappDigits.length > 0;

  function sendWhatsApp() {
    if (!hasWhatsapp) return;
    const anySelected = Object.values(sel).some((v) => v);
    if (!anySelected) {
      setMessage("Please select at least one service.");
      return;
    }
    let msg = `🧹 *${company?.name || "CleanerX"} — New Booking*\n\n`;
    msg += `👤 Name: ${customer.name}\n`;
    msg += `📞 Phone: ${customer.phone}\n`;
    if (customer.address) msg += `📍 Address: ${customer.address}\n`;
    if (customer.location) msg += `🔗 Location: ${customer.location}\n`;
    if (customer.date) msg += `📅 Date: ${customer.date}\n`;
    if (selectedTime) msg += `🕐 Time: ${selectedTime}\n`;
    msg += "\n*Selected Services:*\n";
    billLines.forEach((l) => {
      msg += `• ${l.label}${l.amount != null ? ` — Rs ${l.amount.toLocaleString()}` : ` (${l.note})`}\n`;
    });
    msg += `\n💰 *Total Estimate: Rs ${total.toLocaleString()}*\n\nPlease confirm this booking!`;
    window.open("https://wa.me/" + whatsappDigits + "?text=" + encodeURIComponent(msg), "_blank");
  }

  if (companyState === "loading") {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (companyState === "not_found") {
    return (
      <CenteredMessage
        title="Company Not Found"
        body="We couldn't find a company with this link. Please check the URL and try again."
        color={PRIMARY}
      />
    );
  }

  if (companyState === "inactive") {
    return (
      <CenteredMessage
        title="Company Currently Unavailable"
        body={`${company?.name || "This company"} is not currently accepting bookings.`}
        color={PRIMARY}
      />
    );
  }

  if (companyState === "error") {
    return <CenteredMessage title="Something Went Wrong" body={companyError || "Please try again shortly."} color={PRIMARY} />;
  }

  if (rulesLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-gray-500 text-sm">Loading pricing…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-md p-10 max-w-md text-center border-2 anim-success-in" style={{ borderColor: PRIMARY }}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: PRIMARY }}>
            Booking Submitted!
          </h3>
          <p className="text-gray-500 text-sm mb-6">The {company?.name || "CleanerX"} team will contact you shortly. Thank you! 🙏</p>
          <button
            onClick={() => {
              setSuccess(false);
              setSel({ sofa: false, foam: false, carpet: false, mattress: false, curtain: false, tank: false, regular: false, deep: false });
              setQtys(emptyQtys);
              setCustomer({ name: "", phone: "", address: "", location: "", date: "" });
              setSelectedTime("");
            }}
            className="px-6 py-2 rounded-full font-semibold"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            New Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16 anim-page-in">
      <header className="bg-white text-center py-8 px-4 border-b anim-slide-up" style={{ borderColor: "#e5e7eb" }}>
        {COMPANY_LOGO && (
          <div className="flex justify-center mb-3">
            <img
              src={COMPANY_LOGO}
              alt={company?.name || "CleanerX"}
              className="h-14 max-w-[220px] object-contain"
            />
          </div>
        )}
        <h1 className="text-2xl font-extrabold" style={{ color: PRIMARY }}>
          {company?.name || "CleanerX"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 tracking-wide">Professional Cleaning Services · Faisalabad · Instant Quote</p>
        {rulesError && (
          <p className="text-xs text-amber-600 mt-2">Some pricing could not be loaded — showing default rates where needed.</p>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6">
        <form onSubmit={handleSubmit}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: PRIMARY }}>
            Select Services
          </h2>

          <div className="space-y-3 mb-8">
            {SERVICES.map((s, i) => {
              const active = sel[s.key];
              return (
                <div
                  key={s.key}
                  className={`rounded-2xl border-2 p-4 shadow-sm service-card anim-card-in card-delay-${Math.min(i, 7)}`}
                  style={{
                    borderColor: active ? PRIMARY : "#e5e7eb",
                    backgroundColor: active ? PRIMARY_LIGHT : "#fff",
                    boxShadow: active ? `0 6px 18px ${PRIMARY}26` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0"
                      style={{ borderColor: active ? PRIMARY : "#e5e7eb", background: active ? "#fff" : "#F9FAFB" }}
                    >
                      <ServiceIcon type={s.key} size={24} color={active ? PRIMARY : "#6B7280"} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold" style={{ color: PRIMARY }}>
                        {s.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.rate}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleService(s.key)}
                      className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: active ? PRIMARY : "#d1d5db", backgroundColor: active ? PRIMARY : "#fff" }}
                    >
                      {active && (
                        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                          <path d="M1 5L4.5 9L12 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {active && s.key === "sofa" && (
                    <div className="anim-expand-down">
                      <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">How many seats?</span>
                        <QtyControl value={qtys.sofa} onChange={(v) => setQty("sofa", v)} color={PRIMARY} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                          Rs {(sofaRate(qtys.sofa) * qtys.sofa).toLocaleString()}
                        </div>
                      </div>
                      {qtys.sofa >= ruleValue(rulesByCategory, "sofa", "bulk_threshold") && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                          🏷️ Bulk Discount Active
                        </div>
                      )}
                    </div>
                  )}

                  {active && s.key === "foam" && (
                    <div className="anim-expand-down">
                      <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">How many chairs?</span>
                        <QtyControl value={qtys.foam} onChange={(v) => setQty("foam", v)} color={PRIMARY} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                          Rs {(foamRate(qtys.foam) * qtys.foam).toLocaleString()}
                        </div>
                      </div>
                      {qtys.foam >= ruleValue(rulesByCategory, "foam", "bulk_threshold") && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                          🏷️ Bulk Discount Active
                        </div>
                      )}
                    </div>
                  )}

                  {active && s.key === "carpet" && (
                    <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3 anim-expand-down">
                      <span className="flex-1 text-sm text-gray-500">How many sq ft?</span>
                      <QtyControl value={qtys.carpet} onChange={(v) => setQty("carpet", v)} color={PRIMARY} />
                      <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                        Rs {(carpetRate(qtys.carpet) * qtys.carpet).toLocaleString()}
                      </div>
                    </div>
                  )}

                  {active && s.key === "mattress" && (
                    <div className="mt-4 bg-white rounded-xl border divide-y anim-expand-down">
                      <div className="p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">Single mattress</span>
                        <QtyControl value={qtys.msingle} onChange={(v) => setQty("msingle", v)} color={PRIMARY} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                          Rs {(mattressSingleRate(qtys.msingle) * qtys.msingle).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">Double mattress</span>
                        <QtyControl value={qtys.mdouble} onChange={(v) => setQty("mdouble", v)} color={PRIMARY} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                          Rs {(mattressDoubleRate(qtys.mdouble) * qtys.mdouble).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {active && s.key === "curtain" && (
                    <div className="mt-4 bg-white rounded-xl border divide-y anim-expand-down">
                      {[
                        ["csmall", "Small window curtain"],
                        ["cstd", "Standard curtain"],
                        ["clarge", "Large curtain"],
                        ["cblack", "Blackout / Heavy curtain"],
                      ].map(([key, label]) => (
                        <div key={key} className="p-3 flex items-center gap-3">
                          <span className="flex-1 text-sm text-gray-500">{label}</span>
                          <QtyControl value={qtys[key]} onChange={(v) => setQty(key, v)} color={PRIMARY} />
                          <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: PRIMARY }}>
                            Rs {(curtainPrices[key] * qtys[key]).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {active && s.key === "tank" && (
                    <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3 anim-expand-down">
                      <span className="flex-1 text-sm text-gray-500">Select tank capacity</span>
                      <select
                        value={tankSize}
                        onChange={(e) => setTankSize(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0A1F44]"
                      >
                        <option value={tankBands[500]}>Up to 500 Liters — Rs {tankBands[500].toLocaleString()}</option>
                        <option value={tankBands[1000]}>501–1,000 Liters — Rs {tankBands[1000].toLocaleString()}</option>
                        <option value={tankBands[2000]}>1,001–2,000 Liters — Rs {tankBands[2000].toLocaleString()}</option>
                        <option value={tankBands[5000]}>2,001–5,000 Liters — Rs {tankBands[5000].toLocaleString()}</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: PRIMARY_LIGHT, border: `2px solid ${PRIMARY}` }}>
            <div className="text-center font-extrabold uppercase tracking-wide mb-4 text-sm" style={{ color: PRIMARY }}>
              🏠 Home Cleaning
            </div>
            {["regular", "deep"].map((type) => {
              const active = sel[type];
              const size = type === "regular" ? regularSize : deepSize;
              const setSize = type === "regular" ? setRegularSize : setDeepSize;
              return (
                <div
                  key={type}
                  className="rounded-2xl border-2 p-4 shadow-sm bg-white mb-3 last:mb-0"
                  style={{
                    borderColor: active ? PRIMARY : "#e5e7eb",
                    boxShadow: active ? `0 6px 18px ${PRIMARY}26` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0"
                      style={{ borderColor: active ? PRIMARY : "#e5e7eb", background: active ? "#fff" : "#F9FAFB" }}
                    >
                      <ServiceIcon type={type === "regular" ? "home_regular" : "home_deep"} size={24} color={active ? PRIMARY : "#6B7280"} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold" style={{ color: PRIMARY }}>
                        {type === "regular" ? "Regular Home Cleaning" : "Deep Home Cleaning"}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {type === "regular" ? "Weekly / fortnightly / monthly maintenance cleaning" : "Detailed deep clean — wardrobe, tiles, grease removal, sanitization & more"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleService(type)}
                      className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: active ? PRIMARY : "#d1d5db", backgroundColor: active ? PRIMARY : "#fff" }}
                    >
                      {active && (
                        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                          <path d="M1 5L4.5 9L12 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {active && (
                    <div className="mt-4 bg-white rounded-xl border overflow-hidden anim-expand-down">
                      <div className="p-3 border-b" style={{ backgroundColor: PRIMARY_LIGHT }}>
                        <label className="block text-xs font-medium mb-1" style={{ color: PRIMARY }}>
                          Select home size first
                        </label>
                        <select
                          value={size}
                          onChange={(e) => setSize(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0A1F44]"
                        >
                          <option value="">-- Select home size --</option>
                          <option value="small">3–5 Marla (675–1,361 sq ft)</option>
                          <option value="large">10 Marla – 1 Kanal (2,250–5,445 sq ft)</option>
                        </select>
                      </div>
                      <div className="p-3 divide-y">
                        {roomKeys.map((rk) => {
                          const qkey = `r${rk}-${type}`;
                          const price = size ? roomPrices[type][size][rk] : null;
                          return (
                            <div key={rk} className="py-2 flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium" style={{ color: PRIMARY }}>
                                  {roomNames[rk]}
                                </div>
                                <div className="text-xs" style={{ color: PRIMARY }}>
                                  {price ? `Rs ${price.toLocaleString()}/room` : "—"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <QtyControl value={qtys[qkey]} onChange={(v) => setQty(qkey, v)} color={PRIMARY} />
                                <div className="font-bold text-sm min-w-[55px] text-right" style={{ color: PRIMARY }}>
                                  Rs {(price ? price * (qtys[qkey] || 0) : 0).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="rounded-2xl p-5 mb-8 text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, ${shade(PRIMARY, -0.4)} 100%)` }}
          >
            <div className="text-xs font-semibold uppercase tracking-widest opacity-50 mb-4">Live Bill Summary</div>
            {billLines.length === 0 && <div className="text-sm italic opacity-40">No services selected</div>}
            {billLines.map((l, i) => (
              <div key={i} className="flex justify-between text-sm mb-2 opacity-90">
                <span>{l.label}</span>
                <span style={{ color: l.amount != null ? "#fff" : ACCENT }}>{l.amount != null ? `Rs ${l.amount.toLocaleString()}` : l.note}</span>
              </div>
            ))}
            <hr className="border-white/10 my-3" />
            <div className="flex justify-between items-center">
              <div className="text-xs font-medium uppercase tracking-widest opacity-55">Total Estimate</div>
              <div key={total} className="text-3xl font-bold anim-total-pop" style={{ color: ACCENT }}>
                Rs {total.toLocaleString()}
              </div>
            </div>
          </div>

          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: PRIMARY }}>
            Your Information
          </h2>
          <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">👤 Your Name</label>
              <input
                type="text"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                placeholder="Enter your name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-[#0A1F44]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📞 Phone Number</label>
              <input
                type="tel"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="03xx-xxxxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-[#0A1F44]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📍 Complete Address</label>
              <textarea
                value={customer.address}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                placeholder="Enter your full address"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-[#0A1F44] min-h-[65px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">🔗 Location Link (Optional)</label>
              <input
                type="text"
                value={customer.location}
                onChange={(e) => setCustomer({ ...customer, location: e.target.value })}
                placeholder="maps.google.com/... or paste a Google Maps link"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-[#0A1F44]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📅 Preferred Date</label>
              <input
                type="date"
                value={customer.date}
                onChange={(e) => setCustomer({ ...customer, date: e.target.value })}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-[#0A1F44]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">🕐 Preferred Time</label>
              <div className="flex gap-2 flex-wrap">
                {TIME_SLOTS.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setSelectedTime(t.value)}
                    className="flex-1 min-w-[90px] rounded-lg border px-2 py-2.5 text-sm text-center time-slot-btn"
                    style={
                      selectedTime === t.value
                        ? { backgroundColor: PRIMARY, color: ON_PRIMARY, borderColor: PRIMARY }
                        : { borderColor: "#d1d5db", color: "#111" }
                    }
                  >
                    {t.label}
                    <br />
                    <small>{t.sub}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {message && <p className="text-red-500 text-sm mb-4 text-center anim-error-in">{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl font-bold disabled:opacity-50 booking-submit-btn"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY} 0%, ${shade(PRIMARY, -0.18)} 100%)`,
              color: ON_PRIMARY,
              boxShadow: `0 10px 24px ${PRIMARY}40`,
            }}
          >
            {submitting ? "Submitting..." : "Confirm Booking →"}
          </button>
          {hasWhatsapp ? (
            <button
              type="button"
              onClick={sendWhatsApp}
              className="w-full py-3.5 mt-3 rounded-xl font-bold text-white wa-btn"
              style={{ backgroundColor: "#25d366" }}
            >
              📲 Send via WhatsApp
            </button>
          ) : (
            <p className="w-full py-3.5 mt-3 rounded-xl font-medium text-center text-gray-400 bg-gray-100">
              WhatsApp not available
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
