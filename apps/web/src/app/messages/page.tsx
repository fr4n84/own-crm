import { MessagesView } from "@/features/messages/messages-view";

import styles from "./messages.module.css";

export default function MessagesPage() {
  return (
    <main className={`${styles.theme} mx-auto flex w-full min-w-0 flex-col gap-6 px-4 pt-6 sm:px-6`}>
      <header className="flex flex-col gap-2">
        <h1 className={styles.heading}>Mensajes</h1>
        <p className={styles.subtitle}>
          Conversaciones internas, tareas asignadas y seguimiento de su finalización.
        </p>
      </header>
      <MessagesView />
    </main>
  );
}
