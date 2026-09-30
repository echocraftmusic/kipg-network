export class ECStorage {
  constructor(namespace = "ec") {
    this.namespace = namespace;
  }

  key(name) {
    return `${this.namespace}:${name}`;
  }

  read(name, fallback = null) {
    try {
      const value = localStorage.getItem(this.key(name));
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn(`Unable to read ${name}:`, error);
      return fallback;
    }
  }

  write(name, value) {
    localStorage.setItem(this.key(name), JSON.stringify(value));
    window.EC?.events.emit("ec:storage-change", { name, value });
    return value;
  }

  remove(name) {
    localStorage.removeItem(this.key(name));
    window.EC?.events.emit("ec:storage-change", { name, value: null });
  }

  clearNamespace() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${this.namespace}:`))
      .forEach((key) => localStorage.removeItem(key));
  }
}

