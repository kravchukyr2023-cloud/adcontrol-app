import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#0c0e18] text-white">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />

        <main className="flex-1 p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
