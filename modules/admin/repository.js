export class ECRepository {
  constructor({ storage, collection, idPrefix = "EC" }) {
    this.storage = storage;
    this.collection = collection;
    this.idPrefix = idPrefix;
  }

  all() {
    return this.storage.read(this.collection, []);
  }

  get(id) {
    return this.all().find((item) => item.id === id) ?? null;
  }

  create(values) {
    const items = this.all();
    const timestamp = new Date().toISOString();
    const item = {
      ...values,
      id: `${this.idPrefix}-${crypto.randomUUID()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    items.unshift(item);
    this.storage.write(this.collection, items);
    return item;
  }

  update(id, values) {
    let updated = null;
    const items = this.all().map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...values, id, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (updated) this.storage.write(this.collection, items);
    return updated;
  }

  delete(id) {
    const items = this.all();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    this.storage.write(this.collection, next);
    return true;
  }
}

