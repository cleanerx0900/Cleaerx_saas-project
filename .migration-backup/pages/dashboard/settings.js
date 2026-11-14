import { useEffect } from "react"
import { useRouter } from "next/router"

// The Settings tab was renamed to "Company Profile" (pages/dashboard/company-profile.js),
// which now covers everything this page used to plus branding, contact info,
// business settings, and security. This redirect keeps the old URL working
// for anyone with it bookmarked.
export default function SettingsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/company-profile")
  }, [router])
  return null
}
