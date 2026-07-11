"use client";

import { Component, Suspense, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
};

type State = { errored: boolean };

// Error boundary that swallows failures from asset-loading children
// (drei's useTexture / useEnvironment throw when the fetch returns HTML,
// e.g. behind Vercel SSO). We must not let one broken asset kill the
// whole Canvas subtree.
class AssetErrorBoundary extends Component<Props, State> {
  state: State = { errored: false };

  static getDerivedStateFromError(): State {
    return { errored: true };
  }

  componentDidCatch(error: Error) {
    // Log to console so the failure is visible in devtools without
    // affecting the visible scene.
    if (typeof console !== "undefined") {
      const label = this.props.label ?? "asset";
      console.warn(`[SafeAsset:${label}] load failed —`, error.message);
    }
  }

  render() {
    if (this.state.errored) return this.props.fallback ?? null;
    return this.props.children;
  }
}

export function SafeAsset({ children, fallback = null, label }: Props) {
  return (
    <AssetErrorBoundary fallback={fallback} label={label}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </AssetErrorBoundary>
  );
}
