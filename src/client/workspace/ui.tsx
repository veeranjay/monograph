import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

import { Link } from "react-router-dom";
import {
  X,
  MoreHorizontal,
  Pin,
  Trash2,
  RotateCcw,
  FileText,
  File,
  ListChecks,
  ArrowUpRight,
  Plus,
  Loader2,
} from "lucide-react";
import {
  type LibraryItem,
  ago,
  kindLabel,
  request,
  useAction,
  displayTitle,
} from "./data.js";

export function Button({
  children,
  className = "",
  variant = "primary",
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      {...props}
      disabled={busy || props.disabled}
    >
      {busy ? <Loader2 size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ label, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content ${wide ? "dialog-wide" : ""}`}
        >
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Make a little space for what’s next."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close dialog">
                <X size={19} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  items,
  trigger,
}: {
  trigger?: React.ReactElement;
  items: {
    label: string;
    icon?: React.ReactNode;
    onSelect: () => void;
    danger?: boolean;
  }[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        {trigger || (
          <IconButton label="More options">
            <MoreHorizontal size={19} />
          </IconButton>
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="dropdown-content"
          sideOffset={8}
          align="end"
        >
          {items.map((item, i) => (
            <Dropdown.Item
              className={`dropdown-item ${item.danger ? "danger" : ""}`}
              key={i}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <Plus size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={24} />
      <span>Gathering your workspace…</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Empty
      title="Let’s try that again"
      description={
        error instanceof Error
          ? error.message
          : "Your workspace could not be loaded."
      }
      action={retry && <Button onClick={retry}>Try again</Button>}
    />
  );
}
export class RouteBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ErrorState
        error={this.state.error}
        retry={() => this.setState({ error: null })}
      />
    ) : (
      this.props.children
    );
  }
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const ItemIcon = ({
  kind,
  size = 20,
}: {
  kind: LibraryItem["kind"];
  size?: number;
}) =>
  kind === "pdf" ? (
    <File size={size} />
  ) : kind === "sheet" ? (
    <ListChecks size={size} />
  ) : (
    <FileText size={size} />
  );
export function ItemCard({
  item,
  list = false,
}: {
  item: LibraryItem;
  list?: boolean;
}) {
  const action = useAction();

  async function change(changes: { pinned?: boolean; trashed?: boolean }) {
    await action(
      () =>
        request(`/workspace/items/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(changes),
        }),
      changes.trashed === true
        ? "Moved to trash"
        : changes.trashed === false
          ? "Restored"
          : changes.pinned
            ? "Pinned to your workspace"
            : "Unpinned",
    ).catch(() => {});
  }
  return (
    <article className={`item-card ${list ? "item-row" : ""}`}>
      <Link
        className="item-card-link"
        to={item.href}
        aria-label={`${kindLabel[item.kind]}: ${displayTitle(item.title)}`}
      >
        <span
          className={`item-icon kind-${item.kind}`}
          title={kindLabel[item.kind]}
        >
          <ItemIcon kind={item.kind} />
        </span>
        <div className="item-card-copy">
          <h3>{displayTitle(item.title)}</h3>
          <p>{item.description}</p>
        </div>
        <span className="card-open">
          <ArrowUpRight size={16} />
        </span>
      </Link>
      <div className="card-footer">
        <span className={`tag kind-${item.kind}`}>
          {item.subject || kindLabel[item.kind]}
        </span>
        <span className="card-date">{ago(item.date)}</span>
        {item.pinned && <Pin size={12} className="pin-indicator" />}
      </div>
      <div className="card-menu">
        <Menu
          items={
            item.trashed
              ? [
                  {
                    label: "Restore",
                    icon: <RotateCcw size={15} />,
                    onSelect: () => void change({ trashed: false }),
                  },
                ]
              : [
                  {
                    label: item.pinned ? "Unpin" : "Pin to home",
                    icon: <Pin size={15} />,
                    onSelect: () => void change({ pinned: !item.pinned }),
                  },
                  {
                    label: "Move to trash",
                    icon: <Trash2 size={15} />,
                    danger: true,
                    onSelect: () => void change({ trashed: true }),
                  },
                ]
          }
        />
      </div>
    </article>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const generatedId = React.useId();
  const control = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>>)
    : null;
  const native =
    control &&
    typeof control.type === "string" &&
    ["input", "select", "textarea"].includes(control.type);
  const id = String(control?.props.id || generatedId);
  return (
    <div className="field">
      {native ? (
        <label htmlFor={id}>{label}</label>
      ) : (
        <span id={`${id}-label`}>{label}</span>
      )}
      {control
        ? React.cloneElement(control, {
            id,
            ...(native
              ? { "aria-describedby": hint ? `${id}-hint` : undefined }
              : { "aria-labelledby": `${id}-label` }),
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
