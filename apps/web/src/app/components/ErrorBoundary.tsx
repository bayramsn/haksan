import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-[40vh] place-items-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Beklenmeyen bir hata oluştu</h2>
            <p className="text-sm text-muted-foreground">
              Sayfayı yenileyin. Sorun devam ederse sistem yöneticinize başvurun.
            </p>
            <Button type="button" onClick={() => window.location.reload()}>
              Sayfayı yenile
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
