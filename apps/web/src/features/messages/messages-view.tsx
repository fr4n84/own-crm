"use client";

import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@crm-fran/ui/components/avatar";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Separator } from "@crm-fran/ui/components/separator";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { cn } from "@crm-fran/ui/lib/utils";

import { authClient } from "@/lib/auth-client";

import { NewConversationDialog } from "./new-conversation-dialog";
import { SendTaskDialog } from "./send-task-dialog";
import {
  useCompleteTask,
  useConversationMessages,
  useConversations,
  useMarkConversationRead,
  useMessageUsers,
  useSendMessage,
} from "./use-messages";

export function MessagesView() {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [messageBody, setMessageBody] = useState("");
  const session = authClient.useSession();
  const conversationsQuery = useConversations();
  const usersQuery = useMessageUsers();
  const conversations = conversationsQuery.data ?? [];
  const activeConversationId =
    selectedConversationId ?? conversations[0]?.id;
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const showConversationOnMobile = Boolean(selectedConversationId);
  const messagesQuery = useConversationMessages(activeConversationId);
  const sendMessage = useSendMessage();
  const completeTask = useCompleteTask();
  const markRead = useMarkConversationRead();

  useEffect(() => {
    if (activeConversationId) {
      markRead.mutate({ conversationId: activeConversationId });
    }
  }, [activeConversationId, messagesQuery.data?.length]);

  if (conversationsQuery.isLoading || usersQuery.isLoading) {
    return <Skeleton className="h-[42rem] w-full" />;
  }

  if (conversationsQuery.isError || usersQuery.isError) {
    return <p>Error al cargar los mensajes.</p>;
  }

  const submitMessage = () => {
    if (!activeConversationId || !messageBody.trim()) return;
    sendMessage.mutate(
      { conversationId: activeConversationId, body: messageBody.trim() },
      { onSuccess: () => setMessageBody("") },
    );
  };

  return (
    <Card className="min-h-dvh overflow-hidden md:min-h-[42rem]">
      <CardContent className="grid min-h-dvh p-0 md:min-h-[42rem] md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={cn("min-h-0 flex-col border-r md:flex", showConversationOnMobile ? "hidden" : "flex")}>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">Bandeja de entrada</h2>
              <p className="text-xs text-muted-foreground">
                {conversations.reduce((total, item) => total + item.unreadCount, 0)} sin leer
              </p>
            </div>
            <NewConversationDialog
              users={usersQuery.data ?? []}
              onConversationOpened={setSelectedConversationId}
            />
          </div>
          <Separator />
          <div className="flex max-h-[36rem] flex-col gap-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <Empty heading="No hay conversaciones" />
            ) : (
              conversations.map((conversation) => (
                <Button
                  key={conversation.id}
                  variant={conversation.id === activeConversationId ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <Avatar className="size-9">
                    <AvatarFallback>{getInitials(conversation.participant.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="flex w-full items-center justify-between gap-2">
                      <strong className="truncate">{conversation.participant.name}</strong>
                      {conversation.unreadCount > 0 ? (
                        <Badge>{conversation.unreadCount}</Badge>
                      ) : null}
                    </span>
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {conversation.lastMessage
                        ? conversation.lastMessage.kind === "task"
                          ? `Tarea: ${conversation.lastMessage.taskTitle ?? "Sin título"}`
                          : conversation.lastMessage.body
                        : "Conversación nueva"}
                    </span>
                  </span>
                </Button>
              ))
            )}
          </div>
        </aside>

        {activeConversation ? (
          <section className={cn("min-h-0 min-w-0 flex-col md:flex", showConversationOnMobile ? "flex" : "hidden")}>
            <CardHeader className="flex-row items-center justify-between gap-3 border-b">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Volver a conversaciones"
                  onClick={() => setSelectedConversationId(undefined)}
                >
                  <ArrowLeft />
                </Button>
                <Avatar>
                  <AvatarFallback>{getInitials(activeConversation.participant.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="truncate">{activeConversation.participant.name}</CardTitle>
                  <CardDescription className="truncate">{activeConversation.participant.email}</CardDescription>
                </div>
              </div>
              <SendTaskDialog
                conversationId={activeConversation.id}
                assignee={activeConversation.participant}
              />
            </CardHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4 md:max-h-[30rem] md:min-h-[25rem]">
              {messagesQuery.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (messagesQuery.data ?? []).length === 0 ? (
                <Empty heading="Empieza la conversación" />
              ) : (
                (messagesQuery.data ?? []).map((message) => {
                  const ownMessage = message.senderId === session.data?.user.id;
                  const completed = Boolean(message.taskCompletedAt);
                  const canComplete =
                    message.kind === "task" &&
                    message.taskAssigneeId === session.data?.user.id &&
                    !completed;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}
                    >
                      <div className="flex max-w-[85%] flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm sm:max-w-[70%]">
                        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                          <span>{message.sender.name}</span>
                          <time>{formatMessageTime(message.createdAt)}</time>
                        </div>
                        {message.kind === "task" ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">Tarea</Badge>
                              <Badge variant={completed ? "default" : "outline"}>
                                {completed ? "Completada" : "Pendiente"}
                              </Badge>
                            </div>
                            <strong>{message.taskTitle}</strong>
                            {message.body ? <p className="whitespace-pre-wrap text-sm">{message.body}</p> : null}
                            <p className="text-xs text-muted-foreground">
                              Asignada a {message.taskAssignee?.name ?? "usuario eliminado"}
                              {message.taskDueAt ? ` · Límite ${formatTaskDate(message.taskDueAt)}` : ""}
                            </p>
                            {message.taskCompletedAt ? (
                              <p className="flex items-center gap-1 text-xs">
                                <CheckCircle2 data-icon="inline-start" />
                                Completada el {formatTaskDate(message.taskCompletedAt)}
                              </p>
                            ) : null}
                            {canComplete ? (
                              <Button size="sm" onClick={() => completeTask.mutate({ messageId: message.id })}>
                                <CheckCircle2 data-icon="inline-start" />
                                Marcar completada
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="sticky bottom-0 flex items-end gap-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
              <Textarea
                value={messageBody}
                placeholder="Escribe un mensaje..."
                className="min-h-10 resize-none"
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
              />
              <Button
                size="icon"
                aria-label="Enviar mensaje"
                disabled={!messageBody.trim() || sendMessage.isPending}
                onClick={submitMessage}
              >
                <Send data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : (
          <div className="grid min-h-[42rem] place-items-center p-6">
            <Empty heading="Selecciona o crea una conversación" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMessageTime(value: Date | string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTaskDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
