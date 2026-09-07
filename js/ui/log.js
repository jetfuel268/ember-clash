// Scrolling combat log fed by 'log' events.
export class Log {
  constructor(el) {
    this.el = el;
  }
  append({ text, kind }) {
    const line = document.createElement('div');
    line.className = `log-line log-${kind}`;
    line.textContent = text;
    this.el.appendChild(line);
    while (this.el.children.length > 60) this.el.removeChild(this.el.firstChild);
    this.el.scrollTop = this.el.scrollHeight;
  }
  clear() {
    this.el.textContent = '';
  }
}
