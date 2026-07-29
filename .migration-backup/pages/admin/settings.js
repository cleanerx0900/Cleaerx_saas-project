import { Settings as SettingsIcon, Zap } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Settings</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Platform-level configuration</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-8 max-w-lg">
        <div className="w-12 h-12 rounded-xl bg-[#EBF4FB] flex items-center justify-center mb-4">
          <SettingsIcon size={24} className="text-[#0071BD]" />
        </div>
        <h2 className="text-lg font-bold text-[#111111] mb-2">Platform Settings</h2>
        <p className="text-sm text-[#6B7280] leading-relaxed">
          Company profile, notification preferences, and user management settings will be available here in a future update.
        </p>
        <div className="mt-6 p-3 bg-[#EBF4FB] rounded-xl border border-[#D6EAF8] text-sm text-[#0071BD] font-medium flex items-center gap-2">
          <Zap size={15} />Coming soon
        </div>
      </div>
    </AdminLayout>
  );
}
