import { readDocument } from '../lib/readerCore';

// Injected into a page by the background worker. It only defines a function.
(window as unknown as { __captivumRead: () => unknown }).__captivumRead = () => readDocument(document, location.href);
