"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AccountCenterModal from "./account-center-modal";
import {
  AccountTab,
  OPEN_ACCOUNT_CENTER,
} from "@/lib/account-center/open";

export default function AccountCenterMount() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AccountTab>("profile");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setEmail(data.session?.user.email ?? "");
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ tab?: AccountTab }>;
      if (ce.detail?.tab) {
        setTab(ce.detail.tab);
      }
      setOpen(true);
    }
    window.addEventListener(OPEN_ACCOUNT_CENTER, onOpen);
    return () => window.removeEventListener(OPEN_ACCOUNT_CENTER, onOpen);
  }, []);

  return (
    <AccountCenterModal
      open={open}
      onClose={() => setOpen(false)}
      email={email}
      tab={tab}
      onChangeTab={setTab}
    />
  );
}
