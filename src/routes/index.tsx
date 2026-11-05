import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isNativeWebView } from "@/lib/native-shell";
import { getToken } from "@/lib/api/client";
import {
  getCustomerSession,
  setCustomerSession,
  type CustomerSession,
} from "@/lib/api/customer-portal-api";
import { CustomerLogin } from "@/components/customer/CustomerLogin";
import { CustomerCrm } from "@/components/customer/CustomerCrm";
import customerCrmCss from "@/styles/customer-crm.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "X.E Việt Nam" },
      {
        name: "description",
        content: "X.E Việt Nam — tạo đơn và tra cứu vận đơn.",
      },
    ],
    links: [{ rel: "stylesheet", href: customerCrmCss }],
  }),
  component: IndexPage,
});

function CustomerArea() {
  const [customer, setCustomer] = useState<CustomerSession | null | undefined>(undefined);

  useEffect(() => {
    setCustomer(getCustomerSession());
  }, []);

  if (customer === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
        Đang tải…
      </div>
    );
  }
  if (!customer) return <CustomerLogin onLoggedIn={setCustomer} />;
  return (
    <CustomerCrm
      session={customer}
      onLogout={() => {
        setCustomerSession(null);
        setCustomer(null);
      }}
    />
  );
}

function IndexPage() {
  const { session, hydrated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) return;

    if (isNativeWebView()) {
      navigate({ to: "/native", replace: true });
      return;
    }

    if (session.role === "KT") {
      navigate({ to: "/danh-sach-phieu-thu", replace: true });
      return;
    }
    if (session.role === "AD") {
      navigate({ to: "/tai-khoan", replace: true });
      return;
    }
    if (session.role === "TX" || session.role === "NV") {
      navigate({ to: "/tac-vu", replace: true });
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }, [hydrated, session, navigate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
        Đang tải…
      </div>
    );
  }

  // Native WebView: wait for token injection before showing guest landing.
  if (!session && isNativeWebView() && !getToken()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
        Đang kết nối ứng dụng…
      </div>
    );
  }

  if (!session) {
    return <CustomerArea />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] text-sm text-muted-foreground">
      Đang chuyển hướng…
    </div>
  );
}
