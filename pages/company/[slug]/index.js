import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import supabase from "../../../lib/supabaseClient";
import { NAVY as DEFAULT_NAVY } from "../../../lib/brandDefaults";

const DEFAULT_SECONDARY = "#061024";
const DEFAULT_FONT = "inherit";

// Merge a company's theme_templates/company_themes override into a flat
// {primary, secondary, font} object, falling back to company_settings
// branding and finally hardcoded defaults. Purely derived per-render from
// this company's own rows — never mutates globals, so other tenants are
// never affected.
function resolveTheme(themeRow, settingsRow) {
  const cfg = themeRow?.config && typeof themeRow.config === "object" ? themeRow.config : {};
  return {
    primary: themeRow?.primary_color || cfg.primary_color || settingsRow?.primary_color || DEFAULT_NAVY,
    secondary: themeRow?.secondary_color || cfg.secondary_color || settingsRow?.secondary_color || DEFAULT_SECONDARY,
    font: themeRow?.font_family || cfg.font_family || DEFAULT_FONT,
  };
}

// Pricing engine (sql/migrations/002_services_layer.sql): each service has a
// service_pricing row scoped to the same company_id. Only the base_price is
// shown here (a simple "starting at" price list); the booking page applies
// full tiered logic when a quantity is chosen.
function displayPrice(pricing) {
  const base = Number(pricing?.base_price) || 0;
  const currencyLabel = pricing?.currency === "PKR" || !pricing?.currency ? "Rs" : pricing.currency;
  return `${currencyLabel} ${base.toLocaleString()}`;
}

function CenteredMessage({ title, body, color }) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-10 max-w-md text-center border-2" style={{ borderColor: color }}>
        <div className="text-4xl mb-3">🚫</div>
        <h3 className="text-xl font-bold mb-2" style={{ color }}>
          {title}
        </h3>
        <p className="text-gray-500 text-sm">{body}</p>
      </div>
    </div>
  );
}

export default function CompanyLandingPage() {
  const router = useRouter();
  const { slug } = router.query;

  // Tenant resolution: slug -> company record (+ optional description) and
  // company_settings for branding. Mirrors the resolution used on the
  // booking page so both routes agree on the same company.
  const [companyState, setCompanyState] = useState("loading"); // loading | ok | not_found | inactive | error
  const [company, setCompany] = useState(null);
  const [settings, setSettings] = useState(null);
  const [themeRow, setThemeRow] = useState(null);
  const [companyError, setCompanyError] = useState("");

  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(null);

  const theme = resolveTheme(themeRow, settings);
  const primaryColor = theme.primary;

  useEffect(() => {
    if (!router.isReady) return;
    if (!slug || typeof slug !== "string") {
      setCompanyState("not_found");
      return;
    }

    let cancelled = false;
    async function resolveCompany() {
      setCompanyState("loading");
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setCompanyError(error.message);
        setCompanyState("error");
        return;
      }
      if (!data) {
        setCompanyState("not_found");
        return;
      }
      if (!data.is_active) {
        setCompany(data);
        setCompanyState("inactive");
        return;
      }
      setCompany(data);
      setCompanyState("ok");

      const [{ data: settingsData }, { data: themeData }, { data: subData }] = await Promise.all([
        supabase.from("company_settings").select("logo_url, primary_color, secondary_color").eq("company_id", data.id).maybeSingle(),
        supabase.from("company_themes").select("primary_color, secondary_color, font_family, config").eq("company_id", data.id).maybeSingle(),
        // Subscription system: custom theming is a premium feature
        // (subscription_plans.features.theme_studio). No active subscription
        // or a plan without it means the company's theme override is ignored
        // and default branding is used instead.
        supabase.from("active_subscriptions").select("features").eq("company_id", data.id).maybeSingle(),
      ]);
      if (!cancelled) {
        setSettings(settingsData ?? null);
        setThemeRow(subData?.features?.theme_studio === true ? themeData ?? null : null);
      }
    }

    resolveCompany();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug]);

  useEffect(() => {
    if (companyState !== "ok" || !company?.id) return;
    let cancelled = false;
    async function loadServices() {
      setServicesLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, unit, is_active, service_pricing ( pricing_type, base_price, currency, tiers, is_active )"
        )
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (cancelled) return;
      if (error) {
        setServicesError(error.message);
      } else {
        setServicesError(null);
        const rows = (data || [])
          .map((s) => {
            const pricing = Array.isArray(s.service_pricing) ? s.service_pricing[0] : s.service_pricing;
            return { id: s.id, name: s.name, pricing: pricing && pricing.is_active !== false ? pricing : null };
          })
          .filter((s) => s.pricing != null);
        setServices(rows);
      }
      setServicesLoading(false);
    }
    loadServices();
    return () => {
      cancelled = true;
    };
  }, [companyState, company]);

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
        color={DEFAULT_NAVY}
      />
    );
  }

  if (companyState === "inactive") {
    return (
      <CenteredMessage
        title="Company Currently Unavailable"
        body={`${company?.name || "This company"} is not currently accepting bookings.`}
        color={DEFAULT_NAVY}
      />
    );
  }

  if (companyState === "error") {
    return <CenteredMessage title="Something Went Wrong" body={companyError || "Please try again shortly."} color={DEFAULT_NAVY} />;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]" style={{ fontFamily: theme.font }}>
      <section
        className="text-center py-16 px-4 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${theme.secondary} 100%)` }}
      >
        {settings?.logo_url && (
          <img src={settings.logo_url} alt={company?.name || "Company logo"} className="h-16 mx-auto mb-4 object-contain" />
        )}
        <h1 className="text-3xl font-extrabold">{company?.name}</h1>
        <p className="text-sm opacity-70 mt-2 tracking-wide">Professional Cleaning Services · Instant Quote</p>
        {company?.description && (
          <p className="max-w-xl mx-auto mt-4 text-sm opacity-80">{company.description}</p>
        )}
        <Link
          href={`/company/${slug}/book`}
          className="inline-block mt-8 px-8 py-3 rounded-full font-bold"
          style={{ backgroundColor: "#F5C518", color: primaryColor }}
        >
          Book Now →
        </Link>
      </section>

      <main className="max-w-xl mx-auto px-4 py-10">
        <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: primaryColor }}>
          Our Services
        </h2>

        {servicesLoading && <p className="text-gray-500 text-sm">Loading services…</p>}
        {servicesError && <p className="text-red-500 text-sm">Could not load services: {servicesError}</p>}
        {!servicesLoading && !servicesError && services.length === 0 && (
          <p className="text-gray-500 text-sm">This company hasn't added any services yet.</p>
        )}

        {!servicesLoading && !servicesError && services.length > 0 && (
          <ul className="bg-white rounded-2xl shadow-sm border divide-y">
            {services.map((s) => (
              <li key={s.id} className="p-4 flex justify-between items-center">
                <span className="font-medium" style={{ color: primaryColor }}>
                  {s.name}
                </span>
                <span className="font-bold text-gray-700">{displayPrice(s.pricing)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="text-center mt-10">
          <Link
            href={`/company/${slug}/book`}
            className="inline-block px-8 py-3 rounded-full font-bold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Book Now →
          </Link>
        </div>
      </main>
    </div>
  );
}
