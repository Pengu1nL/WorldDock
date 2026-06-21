import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

type PageToolbarProps = {
  children: ReactNode;
};

type PageBodyProps = {
  children: ReactNode;
  width?: "read" | "work" | "fluid";
  className?: string;
};

type PageSplitProps = {
  main: ReactNode;
  aside: ReactNode;
  asideLabel?: string;
};

export function PageShell({ children, className = "" }: PageShellProps) {
  return <div className={`page-shell view-scroll ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-head page-shell-head">
      <div className="col page-shell-title-group">
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="row gap-2 page-shell-actions">{actions}</div> : null}
    </header>
  );
}

export function PageToolbar({ children }: PageToolbarProps) {
  return (
    <div className="page-toolbar" role="toolbar">
      {children}
    </div>
  );
}

export function PageBody({ children, width = "work", className = "" }: PageBodyProps) {
  return (
    <div className={`page-body page-body-${width} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function PageSplit({ main, aside, asideLabel = "详情" }: PageSplitProps) {
  return (
    <div className="page-split">
      <section className="page-split-main">{main}</section>
      <aside aria-label={asideLabel} className="page-split-aside">
        {aside}
      </aside>
    </div>
  );
}
