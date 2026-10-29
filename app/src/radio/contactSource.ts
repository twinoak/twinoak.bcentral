// Where the register's key picker gets the radio's contact list (P0-03). P0-04 implements
// it on the radio store: every listContacts() reads the list from the companion again.

export interface Contact {
  // MeshCore node public key, 32 bytes as lowercase hex (contract: publicKey).
  publicKey: string;
  // The name the node advertises.
  name: string;
}

export interface ContactSource {
  listContacts(): Promise<Contact[]>;
}

export class FakeContactSource implements ContactSource {
  private readonly contacts: readonly Contact[];

  constructor(contacts: readonly Contact[]) {
    this.contacts = contacts;
  }

  async listContacts(): Promise<Contact[]> {
    return [...this.contacts];
  }
}

// The companion's contact list, refreshed on demand. Rejects when no radio is connected;
// the picker shows the message.
export class CompanionContactSource implements ContactSource {
  private readonly radio: { refreshContacts(): Promise<readonly Contact[]> };

  constructor(radio: { refreshContacts(): Promise<readonly Contact[]> }) {
    this.radio = radio;
  }

  async listContacts(): Promise<Contact[]> {
    const list = await this.radio.refreshContacts();
    return list.map((contact) => ({ publicKey: contact.publicKey, name: contact.name }));
  }
}
