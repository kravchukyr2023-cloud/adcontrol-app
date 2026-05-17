import AccountCenterMount from "@/components/account/account-center-mount";

export default function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      {children}
      <AccountCenterMount />
    </div>
  );
}
