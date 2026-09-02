import { Can } from "@crm-fran/ui/permissions/can";

import { CalendarView } from "@/features/calendar/calendar-view";

import styles from "./calendar.module.css";

export default function CalendarPage() {
  return (
    <div className={styles.theme}>
      <Can permission="leads:read" fallback={<p>No tienes permisos</p>}>
        <main className="mx-auto flex w-full min-w-0 flex-col gap-5 px-4 pt-6 sm:px-6">
          <header className="space-y-2">
            <h1 className={styles.heading}>Calendario</h1>
            <p className={styles.subtitle}>
              Consulta tres días de agendas y abre el feedback del caller desde
              cada cita.
            </p>
          </header>
          <CalendarView />
        </main>
      </Can>
    </div>
  );
}
