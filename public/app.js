const form = document.querySelector("#chat-form");
const input = document.querySelector("#question");
const sendButton = document.querySelector("#send-button");
const conversation = document.querySelector("#conversation");
const history = [];

function addMessage(role, text, sources = []) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;

  const label = document.createElement("p");
  label.className = "message-label";
  label.textContent = role === "user" ? "YOU" : "PROPERTY GUIDE";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  wrapper.append(label, bubble);

  if (sources.length) {
    const citations = document.createElement("div");
    citations.className = "message-sources";
    for (const source of sources) {
      const link = document.createElement("a");
      link.className = "source-chip";
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${source.publisher}: ${source.title}`;
      citations.append(link);
    }
    wrapper.append(citations);
  }

  conversation.append(wrapper);
  conversation.scrollTop = conversation.scrollHeight;
  return wrapper;
}

function setBusy(busy) {
  sendButton.disabled = busy;
  input.disabled = busy;
  sendButton.setAttribute("aria-label", busy ? "Waiting for answer" : "Send message");
}

async function ask(question) {
  const trimmed = question.trim();
  if (!trimmed || sendButton.disabled) return;

  const welcome = conversation.querySelector(".welcome-message");
  welcome?.remove();
  addMessage("user", trimmed);
  input.value = "";
  input.style.height = "auto";
  setBusy(true);

  const pending = addMessage("assistant", "");
  const typing = document.createElement("span");
  typing.className = "typing";
  typing.setAttribute("aria-label", "Thinking");
  typing.innerHTML = "<span></span><span></span><span></span>";
  pending.querySelector(".message-bubble").append(typing);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmed, history })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);

    pending.remove();
    addMessage("assistant", result.answer, result.sources);
    history.push({ role: "user", content: trimmed }, { role: "assistant", content: result.answer });
    if (history.length > 8) history.splice(0, history.length - 8);
  } catch (error) {
    pending.remove();
    addMessage("assistant", error.message || "I couldn't reach the assistant. Please try again.");
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

conversation.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => ask(button.textContent));
});
