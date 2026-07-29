import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { getContrastText, shade } from "../../../lib/colorUtils";
import { emptyQtys, roomKeys, roomNames } from "../../../lib/pricing";
import { MASTER_DEFAULTS, ruleValue, TIME_SLOTS } from "../../../lib/bookingConstants";
import { NAVY as DEFAULT_NAVY } from "../../../lib/brandDefaults";
import ServiceIcon from "../../../components/ServiceIcon";

const GOLD = "#F5C518";

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
        <h3 className="text-xl font-bold mb-2" style={{ color }}>{title}</h3>
        <p className="text-gray-500 text-sm">{body}</p>
      </div>
    </div>
  );
}

function QtyControl({ value, onChange, min = 0, color }) {
  const c = color || DEFAULT_NAVY;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
        className="w-9 h-9 rounded-lg border flex items-center justify-center transition flex-shrink-0 hover:opacity-80"
        style={{ borderColor: c, color: c }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || 0))}
        className="w-14 text-center border border-gray-300 rounded-lg py-1 font-semibold outline-none"
        style={{ color: c }}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-white transition flex-shrink-0 hover:opacity-90"
        style={{ backgroundColor: c }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

export default function CompanyBookService() {
  const router = useRouter();
  const { slug } = router.query;

  // ── Company + branding + pricing rules (all from /api/company-pricing)
  const [companyState, setCompanyState]       = useState("loading"); // loading|ok|not_found|inactive|error
  const [company, setCompany]                 = useState(null);
  const [companyError, setCompanyError]       = useState("");
  const [rulesByCategory, setRulesByCategory] = useState(null);
  const [serviceSettings, setServiceSettings] = useState({}); // { [category]: boolean }
  const [rulesLoading, setRulesLoading]       = useState(true);
  const [rulesError, setRulesError]           = useState(null);
  const [contactSettings, setContactSettings] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (!slug || typeof slug !== "string") { setCompanyState("not_found"); return; }

    let cancelled = false;
    async function load() {
      setCompanyState("loading");
      setRulesLoading(true);
      try {
        const res = await fetch(`/api/company-pricing?slug=${encodeURIComponent(slug)}`);
        if (cancelled) return;

        if (res.status === 404) { setCompanyState("not_found"); setRulesLoading(false); return; }
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
        if (!body.company.is_active) { setCompanyState("inactive"); setRulesLoading(false); return; }
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

        const sMap = {};
        (body.serviceSettings || []).forEach((row) => {
          sMap[row.category] = row.is_active;
        });
        setServiceSettings(sMap);

        setRulesLoading(false);
      } catch (err) {
        if (cancelled) return;
        setCompanyError(err.message || "Something went wrong. Please try again shortly.");
        setCompanyState("error");
        setRulesLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router.isReady, slug]);

  // ── Primary brand color
  const primaryColor  = contactSettings?.primary_color || DEFAULT_NAVY;
  const contrastColor = getContrastText(primaryColor);

  // ── Per-company pricing helpers
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
    cstd:   ruleValue(rulesByCategory, "curtain", "standard"),
    clarge: ruleValue(rulesByCategory, "curtain", "large"),
    cblack: ruleValue(rulesByCategory, "curtain", "blackout"),
  };

  const tankBands = {
    500:  ruleValue(rulesByCategory, "tank", "band_500"),
    1000: ruleValue(rulesByCategory, "tank", "band_1000"),
    2000: ruleValue(rulesByCategory, "tank", "band_2000"),
    5000: ruleValue(rulesByCategory, "tank", "band_5000"),
  };

  const roomPrices = {
    regular: {
      small: {
        bed:     ruleValue(rulesByCategory, "home_regular", "small_bed"),
        lounge:  ruleValue(rulesByCategory, "home_regular", "small_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_regular", "small_kitchen"),
        wash:    ruleValue(rulesByCategory, "home_regular", "small_wash"),
        garage:  ruleValue(rulesByCategory, "home_regular", "small_garage"),
        stair:   ruleValue(rulesByCategory, "home_regular", "small_stair"),
        store:   ruleValue(rulesByCategory, "home_regular", "small_store"),
      },
      large: {
        bed:     ruleValue(rulesByCategory, "home_regular", "large_bed"),
        lounge:  ruleValue(rulesByCategory, "home_regular", "large_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_regular", "large_kitchen"),
        wash:    ruleValue(rulesByCategory, "home_regular", "large_wash"),
        garage:  ruleValue(rulesByCategory, "home_regular", "large_garage"),
        stair:   ruleValue(rulesByCategory, "home_regular", "large_stair"),
        store:   ruleValue(rulesByCategory, "home_regular", "large_store"),
      },
    },
    deep: {
      small: {
        bed:     ruleValue(rulesByCategory, "home_deep", "small_bed"),
        lounge:  ruleValue(rulesByCategory, "home_deep", "small_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_deep", "small_kitchen"),
        wash:    ruleValue(rulesByCategory, "home_deep", "small_wash"),
        garage:  ruleValue(rulesByCategory, "home_deep", "small_garage"),
        stair:   ruleValue(rulesByCategory, "home_deep", "small_stair"),
        store:   ruleValue(rulesByCategory, "home_deep", "small_store"),
      },
      large: {
        bed:     ruleValue(rulesByCategory, "home_deep", "large_bed"),
        lounge:  ruleValue(rulesByCategory, "home_deep", "large_lounge"),
        kitchen: ruleValue(rulesByCategory, "home_deep", "large_kitchen"),
        wash:    ruleValue(rulesByCategory, "home_deep", "large_wash"),
        garage:  ruleValue(rulesByCategory, "home_deep", "large_garage"),
        stair:   ruleValue(rulesByCategory, "home_deep", "large_stair"),
        store:   ruleValue(rulesByCategory, "home_deep", "large_store"),
      },
    },
  };

  // ── All 8 services as uniform cards (Regular + Deep Home Cleaning included)
  const SERVICES = [
    {
      key: "sofa",
      name: "Sofa Cleaning",
      iconType: "sofa",
      rate: `1–9 seats: Rs ${ruleValue(rulesByCategory, "sofa", "standard_rate")}/seat · 10+ seats: Rs ${ruleValue(rulesByCategory, "sofa", "bulk_rate")}/seat`,
    },
    {
      key: "foam",
      name: "Foam Chair Cleaning",
      iconType: "foam",
      rate: `1–9 chairs: Rs ${ruleValue(rulesByCategory, "foam", "standard_rate")}/chair · 10+ chairs: Rs ${ruleValue(rulesByCategory, "foam", "bulk_rate")}/chair`,
    },
    {
      key: "carpet",
      name: "Carpet Cleaning",
      iconType: "carpet",
      rate: `Up to 100: Rs ${ruleValue(rulesByCategory, "carpet", "band_0_100")}/sqft · 101–300: Rs ${ruleValue(rulesByCategory, "carpet", "band_101_300")} · 301–500: Rs ${ruleValue(rulesByCategory, "carpet", "band_301_500")} · 500+: Rs ${ruleValue(rulesByCategory, "carpet", "band_500_plus")}`,
    },
    {
      key: "mattress",
      name: "Mattress Cleaning",
      iconType: "mattress",
      rate: `Single: Rs ${ruleValue(rulesByCategory, "mattress", "single_standard").toLocaleString()} (2+: Rs ${ruleValue(rulesByCategory, "mattress", "single_bulk").toLocaleString()} each) · Double: Rs ${ruleValue(rulesByCategory, "mattress", "double_standard").toLocaleString()} (2+: Rs ${ruleValue(rulesByCategory, "mattress", "double_bulk").toLocaleString()} each)`,
    },
    {
      key: "curtain",
      name: "Curtain Cleaning",
      iconType: "curtain",
      rate: `Small: Rs ${curtainPrices.csmall.toLocaleString()} · Standard: Rs ${curtainPrices.cstd.toLocaleString()} · Large: Rs ${curtainPrices.clarge.toLocaleString()} · Blackout: Rs ${curtainPrices.cblack.toLocaleString()}`,
    },
    {
      key: "tank",
      name: "Water Tank Cleaning",
      iconType: "tank",
      rate: `Up to 500L: Rs ${tankBands[500].toLocaleString()} · 501–1000L: Rs ${tankBands[1000].toLocaleString()} · 1001–2000L: Rs ${tankBands[2000].toLocaleString()} · 2001–5000L: Rs ${tankBands[5000].toLocaleString()}`,
    },
    {
      key: "regular",
      name: "Regular Home Cleaning",
      iconType: "home_regular",
      settingsKey: "home_regular",
      rate: "Weekly / fortnightly / monthly maintenance cleaning",
      isHome: true,
    },
    {
      key: "deep",
      name: "Deep Home Cleaning",
      iconType: "home_deep",
      settingsKey: "home_deep",
      rate: "Detailed deep clean — wardrobe, tiles, grease removal, sanitization & more",
      isHome: true,
    },
  ];

  // ── Bill calculation helpers
  function getTotal(sel, qtys, tankSize, regularSize, deepSize) {
    let total = 0;
    if (sel.sofa)    total += sofaRate(qtys.sofa) * qtys.sofa;
    if (sel.foam)    total += foamRate(qtys.foam) * qtys.foam;
    if (sel.carpet)  total += carpetRate(qtys.carpet) * qtys.carpet;
    if (sel.mattress) {
      total += mattressSingleRate(qtys.msingle) * qtys.msingle;
      total += mattressDoubleRate(qtys.mdouble) * qtys.mdouble;
    }
    if (sel.curtain) {
      total +=
        curtainPrices.csmall * qtys.csmall +
        curtainPrices.cstd   * qtys.cstd   +
        curtainPrices.clarge * qtys.clarge +
        curtainPrices.cblack * qtys.cblack;
    }
    if (sel.tank) total += tankBands[tankSize] || 0;

    ["regular", "deep"].forEach((type) => {
      if (sel[type]) {
        const size = type === "regular" ? regularSize : deepSize;
        if (size) {
          const p = roomPrices[type][size];
          roomKeys.forEach((rk) => {
            total += p[rk] * (qtys[`r${rk}-${type}`] || 0);
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
      lines.push({ label: `🛋️ Sofa Cleaning (${qtys.sofa} seats${qtys.sofa >= 10 ? " — bulk" : ""})`, amount: r * qtys.sofa });
    }
    if (sel.foam) {
      const r = foamRate(qtys.foam);
      lines.push({ label: `🪑 Foam Chair (${qtys.foam} chairs${qtys.foam >= 10 ? " — bulk" : ""})`, amount: r * qtys.foam });
    }
    if (sel.carpet) {
      const r = carpetRate(qtys.carpet);
      lines.push({ label: `🏠 Carpet (${qtys.carpet} sqft @ Rs ${r}/sqft)`, amount: r * qtys.carpet });
    }
    if (sel.mattress) {
      if (qtys.msingle > 0) lines.push({ label: `🛏️ Single Mattress ×${qtys.msingle}`, amount: mattressSingleRate(qtys.msingle) * qtys.msingle });
      if (qtys.mdouble > 0) lines.push({ label: `🛏️ Double Mattress ×${qtys.mdouble}`, amount: mattressDoubleRate(qtys.mdouble) * qtys.mdouble });
    }
    if (sel.curtain) {
      if (qtys.csmall > 0) lines.push({ label: `🪞 Small Curtain ×${qtys.csmall}`,    amount: curtainPrices.csmall * qtys.csmall });
      if (qtys.cstd   > 0) lines.push({ label: `🪞 Standard Curtain ×${qtys.cstd}`,   amount: curtainPrices.cstd   * qtys.cstd   });
      if (qtys.clarge > 0) lines.push({ label: `🪞 Large Curtain ×${qtys.clarge}`,     amount: curtainPrices.clarge * qtys.clarge });
      if (qtys.cblack > 0) lines.push({ label: `🪞 Blackout Curtain ×${qtys.cblack}`,  amount: curtainPrices.cblack * qtys.cblack });
    }
    if (sel.tank) {
      lines.push({ label: "🪣 Water Tank Cleaning", amount: tankBands[tankSize] || 0 });
    }
    ["regular", "deep"].forEach((type) => {
      if (sel[type]) {
        const size  = type === "regular" ? regularSize : deepSize;
        const label = type === "regular" ? "🧹 Regular" : "✨ Deep";
        if (size) {
          const p = roomPrices[type][size];
          roomKeys.forEach((rk) => {
            const q = qtys[`r${rk}-${type}`] || 0;
            if (q > 0) lines.push({ label: `${label} — ${roomNames[rk]} ×${q}`, amount: p[rk] * q });
          });
        } else {
          lines.push({ label: `${label} Cleaning`, amount: null, note: "Select home size" });
        }
      }
    });
    return lines;
  }

  // ── Form state
  const [sel, setSel] = useState({
    sofa: false, foam: false, carpet: false, mattress: false,
    curtain: false, tank: false, regular: false, deep: false,
  });
  const [qtys, setQtys]               = useState(emptyQtys);
  const [tankSize, setTankSize]       = useState(500);
  const [regularSize, setRegularSize] = useState("");
  const [deepSize, setDeepSize]       = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customer, setCustomer]       = useState({ name: "", phone: "", address: "", location: "", date: "" });
  const [message, setMessage]         = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState(false);

  const setQty = (key, val) => setQtys((prev) => ({ ...prev, [key]: val }));

  function resetHomeType(type) {
    setQtys((prev) => {
      const next = { ...prev };
      roomKeys.forEach((rk) => { next[`r${rk}-${type}`] = 0; });
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
        if (turningOn && prev[other]) resetHomeType(other);
        if (!turningOn) resetHomeType(key);
        return { ...prev, [key]: turningOn, [other]: turningOn ? false : prev[other] };
      });
      return;
    }
    setSel((prev) => {
      const turningOn = !prev[key];
      if (!turningOn) {
        // Reset quantities to 0 when deselecting a service
        const resetMap = {
          sofa:    ["sofa"],
          foam:    ["foam"],
          carpet:  ["carpet"],
          mattress: ["msingle", "mdouble"],
          curtain:  ["csmall", "cstd", "clarge", "cblack"],
        };
        if (resetMap[key]) {
          setQtys((q) => {
            const next = { ...q };
            resetMap[key].forEach((qk) => (next[qk] = 0));
            return next;
          });
        }
      } else {
        // When selecting a service, seed the primary quantity to 1 so the
        // form always has a non-zero value ready to submit.
        // Only sets the key if it is currently 0 — preserves any value the
        // user already entered before deselecting and reselecting.
        const seedMap = {
          sofa:     { sofa: 1 },
          foam:     { foam: 1 },
          carpet:   { carpet: 1 },
          mattress: { msingle: 1 },
          curtain:  { csmall: 1 },
        };
        if (seedMap[key]) {
          setQtys((q) => {
            const next = { ...q };
            Object.entries(seedMap[key]).forEach(([qk, v]) => {
              if (next[qk] === 0) next[qk] = v;
            });
            return next;
          });
        }
      }
      return { ...prev, [key]: turningOn };
    });
  }

  const total     = useMemo(() => getTotal(sel, qtys, tankSize, regularSize, deepSize),    [sel, qtys, tankSize, regularSize, deepSize, rulesByCategory]);
  const billLines = useMemo(() => getBillLines(sel, qtys, tankSize, regularSize, deepSize), [sel, qtys, tankSize, regularSize, deepSize, rulesByCategory]);

  function buildServiceSummary() {
    if (billLines.length === 0) return "";
    return billLines
      .map((l) => `${l.label}${l.amount != null ? ` — Rs ${l.amount.toLocaleString()}` : ` (${l.note})`}`)
      .join("; ");
  }

  // ── WhatsApp contact details for this company
  const whatsappDigits = (contactSettings?.whatsapp_number || "").replace(/[^\d]/g, "");
  const hasWhatsapp    = whatsappDigits.length > 0;

  // ── Build the wa.me message from current bill lines
  function buildWhatsAppMessage() {
    let msg = `🧹 *${company?.name || "CleanerX"} — New Booking*\n\n`;
    msg += `👤 Name: ${customer.name}\n`;
    msg += `📞 Phone: ${customer.phone}\n`;
    if (customer.address)  msg += `📍 Address: ${customer.address}\n`;
    if (customer.location) msg += `🔗 Location: ${customer.location}\n`;
    if (customer.date)     msg += `📅 Date: ${customer.date}\n`;
    if (selectedTime)      msg += `🕐 Time: ${selectedTime}\n`;
    msg += "\n*Selected Services:*\n";
    billLines.forEach((l) => {
      msg += `• ${l.label}${l.amount != null ? ` — Rs ${l.amount.toLocaleString()}` : ` (${l.note})`}\n`;
    });
    msg += `\n💰 *Total Estimate: Rs ${total.toLocaleString()}*\n\nPlease confirm this booking!`;
    return msg;
  }

  // ── Single submission action: save booking → notify company (Twilio) → open WhatsApp
  async function handleWhatsAppSubmit() {
    setMessage("");

    const anySelected = Object.values(sel).some((v) => v);
    if (!anySelected) { setMessage("Please select at least one service."); return; }

    const hasValidQty =
      (sel.sofa     && qtys.sofa    > 0) ||
      (sel.foam     && qtys.foam    > 0) ||
      (sel.carpet   && qtys.carpet  > 0) ||
      (sel.mattress && (qtys.msingle > 0 || qtys.mdouble > 0)) ||
      (sel.curtain  && (qtys.csmall > 0 || qtys.cstd > 0 || qtys.clarge > 0 || qtys.cblack > 0)) ||
      sel.tank || sel.regular || sel.deep;
    if (!hasValidQty) { setMessage("Please set a quantity for your selected service(s)."); return; }

    if (!customer.name.trim()) { setMessage("Please enter your name."); return; }
    if (!customer.phone.trim()) { setMessage("Please enter your phone number."); return; }
    if (!customer.date) { setMessage("Please select a preferred date."); return; }

    setSubmitting(true);

    const selections = {
      sofa:    sel.sofa     ? qtys.sofa    : 0,
      foam:    sel.foam     ? qtys.foam    : 0,
      carpet:  sel.carpet   ? qtys.carpet  : 0,
      msingle: sel.mattress ? qtys.msingle : 0,
      mdouble: sel.mattress ? qtys.mdouble : 0,
      csmall:  sel.curtain  ? qtys.csmall  : 0,
      cstd:    sel.curtain  ? qtys.cstd    : 0,
      clarge:  sel.curtain  ? qtys.clarge  : 0,
      cblack:  sel.curtain  ? qtys.cblack  : 0,
      tankCapacity: sel.tank ? tankSize : null,
      regular: sel.regular
        ? { size: regularSize, rooms: Object.fromEntries(roomKeys.map((rk) => [rk, qtys[`r${rk}-regular`] || 0])) }
        : null,
      deep: sel.deep
        ? { size: deepSize, rooms: Object.fromEntries(roomKeys.map((rk) => [rk, qtys[`r${rk}-deep`] || 0])) }
        : null,
    };

    // 1. Create booking in Supabase as "pending"
    let inserted = null;
    let apiError = null;
    try {
      const res = await fetch("/api/create-pricing-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          customer:        { name: customer.name, phone: customer.phone },
          propertyAddress: [customer.address, customer.location].filter(Boolean).join(" | ") || null,
          bookingDate:     customer.date,
          selectedTime:    selectedTime || null,
          selections,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        apiError = body?.error || "Could not save your booking. Please try again shortly.";
      } else {
        inserted = body;
      }
    } catch (err) {
      apiError = err.message || "Could not save your booking. Please try again shortly.";
    }

    setSubmitting(false);

    if (apiError) {
      setMessage("Error: " + apiError);
      return;
    }

    // 2. Booking saved — show success screen
    setSuccess(true);
    setMessage("");

    // 3. Send Twilio WhatsApp notification to company owner (fire-and-forget)
    if (inserted?.id) {
      fetch("/api/booking-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: inserted.id, companyId: inserted.companyId }),
      }).catch((err) => console.error("Booking notification failed:", err));
    }

    // 4. Open WhatsApp for the customer to send their own message to the company
    if (hasWhatsapp) {
      window.open(
        "https://wa.me/" + whatsappDigits + "?text=" + encodeURIComponent(buildWhatsAppMessage()),
        "_blank"
      );
    }
  }

  // ── Render states
  if (companyState === "loading") {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }
  if (companyState === "not_found") {
    return <CenteredMessage title="Company Not Found" body="We couldn't find a company with this link. Please check the URL and try again." color={DEFAULT_NAVY} />;
  }
  if (companyState === "inactive") {
    return <CenteredMessage title="Company Currently Unavailable" body={`${company?.name || "This company"} is not currently accepting bookings.`} color={DEFAULT_NAVY} />;
  }
  if (companyState === "error") {
    return <CenteredMessage title="Something Went Wrong" body={companyError || "Please try again shortly."} color={DEFAULT_NAVY} />;
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
        <div className="bg-white rounded-2xl shadow-md p-10 max-w-md text-center border-2 anim-success-in" style={{ borderColor: primaryColor }}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mb-2" style={{ color: primaryColor }}>Booking Submitted!</h3>
          <p className="text-gray-500 text-sm mb-6">The {company?.name || "team"} will contact you shortly. Thank you! 🙏</p>
          <button
            onClick={() => {
              setSuccess(false);
              setSel({ sofa: false, foam: false, carpet: false, mattress: false, curtain: false, tank: false, regular: false, deep: false });
              setQtys(emptyQtys);
              setCustomer({ name: "", phone: "", address: "", location: "", date: "" });
              setSelectedTime("");
            }}
            className="px-6 py-2 rounded-full text-white font-semibold"
            style={{ backgroundColor: primaryColor }}
          >
            New Booking
          </button>
        </div>
      </div>
    );
  }

  // ── Filter which services to show based on company settings
  const visibleServices = SERVICES.filter((s) => {
    const settingsKey = s.settingsKey || s.key;
    return serviceSettings[settingsKey] !== false;
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16 anim-page-in">
      {/* ── Header */}
      <header className="bg-white text-center py-8 px-4 border-b border-gray-200 anim-slide-up">
        {contactSettings?.logo_url && (
          <img src={contactSettings.logo_url} alt={company?.name || "Company logo"} className="h-14 mx-auto mb-3 object-contain" />
        )}
        <h1 className="text-2xl font-extrabold" style={{ color: primaryColor }}>
          {company?.name || "CleanerX"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 tracking-wide">Professional Cleaning Services · Instant Quote</p>
        {rulesError && (
          <p className="text-xs text-amber-600 mt-2">Some pricing could not be loaded — showing default rates where needed.</p>
        )}
      </header>

      {/* ── Two-column layout: left = form, right = sticky summary */}
      <div className="max-w-6xl mx-auto px-4 pt-8 lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start">

        {/* ══ LEFT COLUMN ══ */}
        <form onSubmit={(e) => e.preventDefault()}>

          {/* Service Cards */}
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: primaryColor }}>
            Select Services
          </h2>

          <div className="space-y-3 mb-8">
            {visibleServices.map((s, i) => {
              const active = sel[s.key];
              // Home services: size state
              const size    = s.key === "regular" ? regularSize : s.key === "deep" ? deepSize : null;
              const setSize = s.key === "regular" ? setRegularSize : s.key === "deep" ? setDeepSize : null;

              return (
                <div
                  key={s.key}
                  className={`rounded-2xl border-2 p-4 shadow-sm service-card anim-card-in card-delay-${Math.min(i, 7)}`}
                  style={{
                    borderColor:     active ? primaryColor : "#e5e7eb",
                    backgroundColor: active ? "#EEF2FA" : "#fff",
                    boxShadow:       active ? `0 6px 18px ${primaryColor}26` : undefined,
                  }}
                >
                  {/* Card header row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0"
                      style={{ borderColor: active ? primaryColor : "#e5e7eb", background: active ? "#fff" : "#F9FAFB" }}
                    >
                      <ServiceIcon type={s.iconType} size={24} color={active ? primaryColor : "#6B7280"} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold" style={{ color: primaryColor }}>{s.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.rate}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleService(s.key)}
                      className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: active ? primaryColor : "#d1d5db", backgroundColor: active ? primaryColor : "#fff" }}
                    >
                      {active && (
                        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                          <path d="M1 5L4.5 9L12 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* ── Sofa qty */}
                  {active && s.key === "sofa" && (
                    <div className="anim-expand-down">
                      <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">How many seats?</span>
                        <QtyControl value={qtys.sofa} onChange={(v) => setQty("sofa", v)} color={primaryColor} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
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

                  {/* ── Foam chair qty */}
                  {active && s.key === "foam" && (
                    <div className="anim-expand-down">
                      <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">How many chairs?</span>
                        <QtyControl value={qtys.foam} onChange={(v) => setQty("foam", v)} color={primaryColor} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
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

                  {/* ── Carpet sqft */}
                  {active && s.key === "carpet" && (
                    <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3 anim-expand-down">
                      <span className="flex-1 text-sm text-gray-500">How many sq ft?</span>
                      <QtyControl value={qtys.carpet} onChange={(v) => setQty("carpet", v)} color={primaryColor} />
                      <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
                        Rs {(carpetRate(qtys.carpet) * qtys.carpet).toLocaleString()}
                      </div>
                    </div>
                  )}

                  {/* ── Mattress — single + double */}
                  {active && s.key === "mattress" && (
                    <div className="mt-4 bg-white rounded-xl border divide-y anim-expand-down">
                      <div className="p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">Single mattress</span>
                        <QtyControl value={qtys.msingle} onChange={(v) => setQty("msingle", v)} color={primaryColor} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
                          Rs {(mattressSingleRate(qtys.msingle) * qtys.msingle).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 flex items-center gap-3">
                        <span className="flex-1 text-sm text-gray-500">Double mattress</span>
                        <QtyControl value={qtys.mdouble} onChange={(v) => setQty("mdouble", v)} color={primaryColor} />
                        <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
                          Rs {(mattressDoubleRate(qtys.mdouble) * qtys.mdouble).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Curtain — 4 types */}
                  {active && s.key === "curtain" && (
                    <div className="mt-4 bg-white rounded-xl border divide-y anim-expand-down">
                      {[
                        ["csmall", "Small window curtain"],
                        ["cstd",   "Standard curtain"],
                        ["clarge", "Large curtain"],
                        ["cblack", "Blackout / Heavy curtain"],
                      ].map(([key, label]) => (
                        <div key={key} className="p-3 flex items-center gap-3">
                          <span className="flex-1 text-sm text-gray-500">{label}</span>
                          <QtyControl value={qtys[key]} onChange={(v) => setQty(key, v)} color={primaryColor} />
                          <div className="font-bold text-sm min-w-[80px] text-right" style={{ color: primaryColor }}>
                            Rs {(curtainPrices[key] * qtys[key]).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Water tank — capacity selector */}
                  {active && s.key === "tank" && (
                    <div className="mt-4 bg-white rounded-xl border p-3 flex items-center gap-3 anim-expand-down">
                      <span className="flex-1 text-sm text-gray-500">Select tank capacity</span>
                      <select
                        value={tankSize}
                        onChange={(e) => setTankSize(Number(e.target.value))}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ outlineColor: primaryColor }}
                      >
                        <option value={500}>Up to 500 Liters — Rs {tankBands[500].toLocaleString()}</option>
                        <option value={1000}>501–1,000 Liters — Rs {tankBands[1000].toLocaleString()}</option>
                        <option value={2000}>1,001–2,000 Liters — Rs {tankBands[2000].toLocaleString()}</option>
                        <option value={5000}>2,001–5,000 Liters — Rs {tankBands[5000].toLocaleString()}</option>
                      </select>
                    </div>
                  )}

                  {/* ── Regular / Deep Home Cleaning — size selector + per-room qtys */}
                  {active && s.isHome && (
                    <div className="mt-4 bg-white rounded-xl border overflow-hidden anim-expand-down">
                      {/* House size selector */}
                      <div className="p-3 border-b" style={{ backgroundColor: "#EEF2FA" }}>
                        <label className="block text-xs font-medium mb-1" style={{ color: primaryColor }}>
                          Select home size first
                        </label>
                        <select
                          value={size}
                          onChange={(e) => setSize(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
                        >
                          <option value="">-- Select home size --</option>
                          <option value="small">3–5 Marla (675–1,361 sq ft)</option>
                          <option value="large">10 Marla – 1 Kanal (2,250–5,445 sq ft)</option>
                        </select>
                      </div>
                      {/* Per-room qty rows — only shown after home size is selected */}
                      {size ? (
                        <div className="p-3 divide-y">
                          {roomKeys.map((rk) => {
                            const qkey  = `r${rk}-${s.key}`;
                            const price = roomPrices[s.key][size][rk];
                            return (
                              <div key={rk} className="py-2 flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium" style={{ color: primaryColor }}>{roomNames[rk]}</div>
                                  <div className="text-xs text-gray-400">Rs {price.toLocaleString()}/room</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <QtyControl value={qtys[qkey]} onChange={(v) => setQty(qkey, v)} color={primaryColor} />
                                  <div className="font-bold text-sm min-w-[55px] text-right" style={{ color: primaryColor }}>
                                    Rs {(price * (qtys[qkey] || 0)).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-400 italic">
                          Please select home size first
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Customer Information */}
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: primaryColor }}>
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📞 Phone Number</label>
              <input
                type="tel"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="03xx-xxxxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📍 Complete Address</label>
              <textarea
                value={customer.address}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                placeholder="Enter your full address"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-gray-400 min-h-[65px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">🔗 Location Link (Optional)</label>
              <input
                type="text"
                value={customer.location}
                onChange={(e) => setCustomer({ ...customer, location: e.target.value })}
                placeholder="maps.google.com/... or paste a Google Maps link"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">📅 Preferred Date</label>
              <input
                type="date"
                value={customer.date}
                onChange={(e) => setCustomer({ ...customer, date: e.target.value })}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none booking-input focus:border-gray-400"
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
                        ? { backgroundColor: primaryColor, color: contrastColor, borderColor: primaryColor }
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
        </form>

        {/* ══ RIGHT COLUMN — Booking Summary (sticky on desktop, stacks below form on mobile/tablet) ══ */}
        <div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden lg:sticky lg:top-6">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#0871BD" }}>
                Booking Summary
              </div>
              <div key={total} className="text-3xl font-extrabold anim-total-pop" style={{ color: "#0871BD" }}>
                Rs {total.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Estimated total</div>
            </div>

            {/* Line items */}
            <div className="px-6 py-4 min-h-[100px]">
              {billLines.length === 0 ? (
                <p className="text-sm italic text-gray-400">No services selected yet</p>
              ) : (
                <div className="space-y-2.5">
                  {billLines.map((l, i) => (
                    <div key={i} className="flex justify-between text-sm gap-3">
                      <span className="text-gray-600">{l.label}</span>
                      <span className="font-semibold flex-shrink-0" style={{ color: l.amount != null ? "#0871BD" : "#3886FF" }}>
                        {l.amount != null ? `Rs ${l.amount.toLocaleString()}` : l.note}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Grand total row */}
            <div className="mx-6 border-t border-gray-100" />
            <div className="px-6 py-4 flex justify-between items-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">Total Estimate</span>
              <span key={`gt-${total}`} className="text-xl font-extrabold anim-total-pop" style={{ color: "#0871BD" }}>
                Rs {total.toLocaleString()}
              </span>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 space-y-3">
              {hasWhatsapp ? (
                <button
                  type="button"
                  onClick={handleWhatsAppSubmit}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2 wa-btn"
                  style={{
                    background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                    boxShadow: "0 6px 18px #25D36633",
                  }}
                >
                  {submitting ? (
                    "Saving Booking…"
                  ) : (
                    <>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.847L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.959 0-3.784-.538-5.348-1.472l-.384-.227-3.98 1.038 1.06-3.872-.249-.398A9.803 9.803 0 012.182 12C2.182 6.577 6.577 2.182 12 2.182S21.818 6.577 21.818 12 17.423 21.818 12 21.818zm6.406-7.845c-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.148-.669.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.882-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.075-.124-.273-.198-.571-.347z"/>
                      </svg>
                      Send via WhatsApp
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleWhatsAppSubmit}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm disabled:opacity-50 booking-submit-btn"
                  style={{
                    background: "linear-gradient(135deg, #0871BD 0%, #3886FF 100%)",
                    boxShadow: "0 6px 18px #0871BD33",
                  }}
                >
                  {submitting ? "Saving Booking…" : "Submit Booking"}
                </button>
              )}

              {message && (
                <p className="text-xs text-red-500 text-center pt-1">{message}</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
