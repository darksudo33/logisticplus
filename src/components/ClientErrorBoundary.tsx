import React from "react";
import { reportClientError } from "@/src/lib/errorReporting";

type State = { hasError: boolean };

export class ClientErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  state: State = { hasError: false };
  declare props: React.PropsWithChildren<{}>;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError({
      source: "react",
      message: error.message || "React render error",
      stack: error.stack,
      context: { componentStack: info.componentStack },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-black mb-2">خطایی در نمایش صفحه رخ داد</h1>
          <p className="text-sm text-muted-foreground mb-5">
            گزارش خطا برای بررسی در پنل ادمین ثبت شد. صفحه را دوباره بارگذاری کنید.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            بارگذاری مجدد
          </button>
        </div>
      </div>
    );
  }
}
