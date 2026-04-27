import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={`px-5 pt-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={`px-5 py-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-sm font-semibold text-white ${className}`}
      {...rest}
    >
      {children}
    </h3>
  );
}
