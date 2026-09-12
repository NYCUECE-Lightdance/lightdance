import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MdClose } from "react-icons/md";
import "./ShortcutModal.css";

const components = {
  table: ({ children }) => <table className="shortcut-table">{children}</table>,
  thead: ({ children }) => <thead className="shortcut-thead">{children}</thead>,
  th: ({ children }) => <th className="shortcut-th">{children}</th>,
  td: ({ children }) => <td className="shortcut-td">{children}</td>,
  h1: ({ children }) => <h2 className="shortcut-h1">{children}</h2>,
  h2: ({ children }) => <h3 className="shortcut-h2">{children}</h3>,
  h3: ({ children }) => <h4 className="shortcut-h3">{children}</h4>,
  code: ({ children }) => <code className="shortcut-code">{children}</code>,
  blockquote: ({ children }) => (
    <blockquote className="shortcut-blockquote">{children}</blockquote>
  ),
  hr: () => <hr className="shortcut-hr" />,
  p: ({ children }) => <p className="shortcut-p">{children}</p>,
  ul: ({ children }) => <ul className="shortcut-ul">{children}</ul>,
  li: ({ children }) => <li className="shortcut-li">{children}</li>,
  strong: ({ children }) => <strong className="shortcut-strong">{children}</strong>,
};

export default function ShortcutModal({ isOpen, onClose }) {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    fetch("/shortcuts.md")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((text) => {
        setMarkdown(text);
        setError(false);
      })
      .catch((err) => {
        console.error("Failed to load shortcuts:", err);
        setError(true);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="shortcut-modal-overlay" onClick={onClose}>
      <div
        className="shortcut-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcut-modal-header">
          <span className="shortcut-modal-title">鍵盤快速鍵速查表</span>
          <button className="shortcut-close-btn" onClick={onClose}>
            <MdClose size={20} />
          </button>
        </div>
        <div className="shortcut-modal-body">
          {error ? (
            <div className="shortcut-error">無法載入快速鍵文件，請稍後再試。</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {markdown}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
