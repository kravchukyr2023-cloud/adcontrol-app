"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { META_CONNECTION_CHANGED } from "@/lib/meta/events";

export type MetaConnectionState = {
  status: "loading" | "connected" | "disconnected" | "expired" | "none";
  connectionId: string | null;
  metaUserName: string | null;
  metaUserId: string | null;
  tokenExpiresAt: string | null;
  lastConnectedAt: string | null;
};

const INITIAL: MetaConnectionState = {
  status: "loading",
  connectionId: null,
  metaUserName: null,
  metaUserId: null,
  tokenExpiresAt: null,
  lastConnectedAt: null,
};

export function useMetaConnection(): MetaConnectionState {
  const [state, setState] = useState<MetaConnectionState>(INITIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    function onChange() {
      setVersion((v) => v + 1);
    }
    window.addEventListener(META_CONNECTION_CHANGED, onChange);
    return () =>
      window.removeEventListener(META_CONNECTION_CHANGED, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data, error } = await supabase
        .from("meta_connections")
        .select(
          "id, meta_user_id, meta_user_name, status, token_expires_at, last_connected_at"
        )
        .order("last_connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setState({
          status: "none",
          connectionId: null,
          metaUserName: null,
          metaUserId: null,
          tokenExpiresAt: null,
          lastConnectedAt: null,
        });
        return;
      }

      const row = data as {
        id: string;
        meta_user_id: string;
        meta_user_name: string | null;
        status: string;
        token_expires_at: string | null;
        last_connected_at: string;
      };

      let status: MetaConnectionState["status"] = "disconnected";
      if (row.status === "active") {
        if (
          row.token_expires_at &&
          new Date(row.token_expires_at).getTime() < Date.now()
        ) {
          status = "expired";
        } else {
          status = "connected";
        }
      } else if (row.status === "expired") {
        status = "expired";
      } else if (row.status === "disconnected") {
        status = "disconnected";
      } else {
        status = "disconnected";
      }

      setState({
        status,
        connectionId: row.id,
        metaUserName: row.meta_user_name,
        metaUserId: row.meta_user_id,
        tokenExpiresAt: row.token_expires_at,
        lastConnectedAt: row.last_connected_at,
      });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [version]);

  return state;
}
