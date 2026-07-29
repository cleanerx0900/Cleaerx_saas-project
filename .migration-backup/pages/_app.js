import Head from "next/head";
import "../styles/globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ImpersonationProvider } from "../contexts/ImpersonationContext";

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <TenantProvider>
        <ImpersonationProvider>
          <Head>
            {/* viewport-fit=cover enables env(safe-area-inset-*) so the
                dashboard layout can pad around notches/home indicators */}
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          </Head>
          <Component {...pageProps} />
        </ImpersonationProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
