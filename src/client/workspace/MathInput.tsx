import React, { useEffect, useRef, useState } from "react";
import { Bold, Italic, Sigma } from "lucide-react";
import { filterSlashCommands, type SlashCommand } from "../lib/mathCommands.js";
import { IconButton } from "./ui.js";

/** Controlled Markdown/LaTeX input with keyboard-driven symbol completion. */
export function MathInput({
  autoSize = false,
  toolbar = false,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  autoSize?: boolean;
  toolbar?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [match, setMatch] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const commands = match ? filterSlashCommands(match.query).slice(0, 8) : [];
  useEffect(() => {
    if (autoSize && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [props.value, autoSize]);
  function change(value: string, start: number, end = start) {
    const node = ref.current;
    if (!node) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.focus();
    requestAnimationFrame(() => node.setSelectionRange(start, end));
  }
  function insert(command: SlashCommand) {
    if (!ref.current) return;
    const node = ref.current;
    const text = String(props.value || "");
    const start = match?.start ?? node.selectionStart;
    const end = match ? start + 1 + match.query.length : node.selectionEnd;
    const value = text.slice(0, start) + command.template + text.slice(end);
    change(
      value,
      start + (command.selectRange?.[0] ?? command.template.length),
      start + (command.selectRange?.[1] ?? command.template.length),
    );
    setMatch(null);
  }
  function format(marker: string) {
    const node = ref.current;
    if (!node) return;
    const text = String(props.value || "");
    const start = node.selectionStart;
    const end = node.selectionEnd;
    change(
      text.slice(0, start) +
        marker +
        text.slice(start, end) +
        marker +
        text.slice(end),
      start + marker.length,
      end + marker.length,
    );
  }
  return (
    <div className="math-input">
      {toolbar && (
        <div className="math-input-toolbar">
          <IconButton
            label="Bold selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format("**")}
          >
            <Bold size={14} />
          </IconButton>
          <IconButton
            label="Italic selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format("*")}
          >
            <Italic size={14} />
          </IconButton>
          <IconButton
            label="Insert an equation"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format("$")}
          >
            <Sigma size={15} />
          </IconButton>
          <span>Markdown & LaTeX · / for symbols</span>
        </div>
      )}
      <textarea
        {...props}
        ref={ref}
        onChange={(e) => {
          props.onChange?.(e);
          const before = e.target.value.slice(0, e.target.selectionStart);
          const result = before.match(/(?:^|\s)\/([a-zA-Z]{1,24})$/);
          setMatch(
            result
              ? {
                  start: before.length - result[1].length - 1,
                  query: result[1],
                }
              : null,
          );
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (
            (e.ctrlKey || e.metaKey) &&
            ["b", "i"].includes(e.key.toLowerCase())
          ) {
            e.preventDefault();
            format(e.key.toLowerCase() === "b" ? "**" : "*");
            return;
          }
          if (match && commands.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % commands.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + commands.length) % commands.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(commands[active]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMatch(null);
              return;
            }
          }
          props.onKeyDown?.(e);
        }}
      />
      {match && commands.length > 0 && (
        <div
          className="math-completions"
          role="listbox"
          aria-label="Math and formatting commands"
        >
          {commands.map((command, i) => (
            <button
              type="button"
              key={command.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "selected" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(command)}
            >
              <span>{command.glyph}</span>
              <strong>{command.label}</strong>
              <small>{command.category}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
