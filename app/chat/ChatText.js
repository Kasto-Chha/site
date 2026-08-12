import { parseChatText } from "../../lib/chatFormat";

// Renders one assistant answer. Everything is built as React elements from
// parsed spans, so the model's text is never treated as markup.
function renderSpans(spans) {
  return spans.map((span, index) => {
    if (span.bold) return <strong key={index}>{span.text}</strong>;
    if (span.italic) return <em key={index}>{span.text}</em>;
    if (span.code) return <code key={index}>{span.text}</code>;
    return <span key={index}>{span.text}</span>;
  });
}

export default function ChatText({ content }) {
  const blocks = parseChatText(content);
  if (!blocks.length) return null;

  return (
    <div className="chat-md">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p className="chat-md-h" key={index}>
              {renderSpans(block.spans)}
            </p>
          );
        }

        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List className="chat-md-list" key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderSpans(item)}</li>
              ))}
            </List>
          );
        }

        return <p key={index}>{renderSpans(block.spans)}</p>;
      })}
    </div>
  );
}
