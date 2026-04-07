"use client";

import {
  ChatBubble,
  ChatBubbleAction,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  CopyIcon,
  Mic,
  Download,
  RefreshCcw,
  Send,
  Volume2,
  ArrowUp,
} from "lucide-react";
import { useEffect, useRef, useState, Suspense } from "react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeDisplayBlock from "@/components/code-display-block";
import { useSearchParams } from "next/navigation";
import { useSnackbar } from "notistack"

const ChatAiIcons = [
  {
    icon: CopyIcon,
    label: "Copy",
  },
  // {
  //   icon: RefreshCcw,
  //   label: "Refresh",
  // },
  // {
  //   icon: Volume2,
  //   label: "Volume",
  // },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  // Add a new field to track if this message contains an image
  image?: string;
}

declare global {
  class AndroidBinding {
    public static showCreditPaymentModal(payload: any): void;
    public static showElecricityPaymentModal(payload: any): void;
    public static showGasPaymentModal(payload: any): void;
    public static showGovernmentPaymentModal(payload: any): void;
    public static showInternetPaymentModal(payload: any): void;
    public static showMobilePaymentModal(payload: any): void;
    public static showP2PPaymentModal(payload: any): void;
    public static showTransportPaymentModal(payload: any): void;
    public static showWaterPaymentModal(payload: any): void;
    public static postMessage(payload: any): void;
  }
}

// Custom component to render images in OpenAI style
const ImageDisplay = ({ base64Image }: { base64Image: string }) => {
  return (
    <div className="mt-2 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-800">
      <div className="relative w-full aspect-square max-w-xl mx-auto">
        <Image 
          src={`data:image/jpeg;base64,${base64Image}`} 
          alt="Generated image" 
          fill
          className="object-contain"
          priority
        />
      </div>
      <div className="flex items-center justify-end gap-2 p-2 bg-gray-700">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => {
            // Create a download link
            const link = document.createElement('a');
            link.href = `data:image/jpeg;base64,${base64Image}`;
            link.download = `generated-image-${new Date().getTime()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
        >
          <Download className="mr-2 size-4" />
          Download
        </Button>
      </div>
    </div>
  );
};

function generateUUID() {
  const str = () =>
    (
      "00000000000000000" +
      (Math.random() * 0xffffffffffffffff).toString(16)
    ).slice(-16);
  const a = str();
  const b = str();
  return (
    a.slice(0, 8) +
    "-" +
    a.slice(8, 12) +
    "-4" +
    a.slice(13) +
    "-a" +
    b.slice(1, 4) +
    "-" +
    b.slice(4)
  );
}

// Separate component that uses useSearchParams inside Suspense
function ChatAppContent() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [locale, setLocale] = useState("uz");
  const [clientId, setClientId] = useState<String>();

  // Switch state and backup for chat history
  const [showHello, setShowHello] = useState(false);
  const [backupMessages, setBackupMessages] = useState<Message[]>([]);

  // Audio recording states and refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const formRef = useRef<HTMLFormElement>(null);

  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();


  useEffect(() => {

  const locale = searchParams.get("locale") || "uz"; // Default: "en"
  const clientId = searchParams.get("clientId") || generateUUID();
  setLocale(locale);
  setClientId(clientId);

    const url = new URL(`/api/v1/session/${clientId}?locale=${locale}`, location.origin);

    if (url.protocol === "https:") {
      url.protocol = "wss:";
    } else {
      url.protocol = "ws:";
    }

    const socket = new WebSocket(url.toString());

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "app-action-credit-payment") {
        AndroidBinding.showCreditPaymentModal(JSON.stringify(data.payload))
      }

      if (data.type === "app-action-electricity-payment") {
        AndroidBinding.showElecricityPaymentModal(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-gas-payment") {        
        AndroidBinding.postMessage(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-government-service-payment") {
        console.log(data.payload);
        
        AndroidBinding.postMessage(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-internet-payment") {        
        AndroidBinding.postMessage(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-mobile-operator-payment") {
        AndroidBinding.postMessage(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-send-payment-modal") {
        AndroidBinding.postMessage(JSON.stringify({
          action: "p2p-payment",
          data: data.payload
        }))
      }
      if (data.type === "app-action-transport-service-payment") {
        AndroidBinding.showTransportPaymentModal(JSON.stringify(data.payload))
      }
      if (data.type === "app-action-water-payment") {
        AndroidBinding.showWaterPaymentModal(JSON.stringify(data.payload))
      }

      // Handle image type differently
      if (data.type === "image") {
        setMessages(prev => {
          return [...prev, { 
            role: "assistant", 
            content: "Generated image:", 
            image: data.image // Store the base64 image data separately
          }];
        });
      }
      else if (data.type === "token") {
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: lastMessage.content + data.token }
            ];
          } else {
            return [...prev, { role: "assistant", content: data.token}];
          }
        });
        setIsGenerating(true);
      }
      else if (data.type === "completion") {
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: data.completion }
            ];
          } else {
            return [...prev, { role: "assistant", content: data.completion }];
          }
        });
        setIsGenerating(false);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ws || !input.trim() || !isConnected) return;

    try {
      const userMessage: Message = { role: "user", content: input };
      setMessages(prev => [...prev, userMessage]);

      ws.send(JSON.stringify({ data: input }));
      setInput("");
      setIsGenerating(true);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsGenerating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating || !input) return;
      setIsGenerating(true);
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  const handleActionClick = async (action: string, messageIndex: number) => {
    console.log("Action clicked:", action, "Message index:", messageIndex);
    if (action === "Refresh") {
      setIsGenerating(true);
      try {
        // Implement refresh functionality if needed
      } catch (error) {
        console.error("Error reloading:", error);
      } finally {
        setIsGenerating(false);
      }
    }

    if (action === "Copy") {
      const message = messages[messageIndex];
      if (message && message.role === "assistant") {
        navigator.clipboard.writeText(message.content);
      }
    }
  };

  // Toggle recording when microphone button is clicked
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      // Create a MediaRecorder instance
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      // Event handler for when data is available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      
    } catch (error) {
      enqueueSnackbar(
        locale === "uz"
          ? "Ovoz yozishni boshlashda xatolik yuz berdi"
          : locale === "ru"
          ? "Ошибка при начале записи звука"
          : "Error starting audio recording",
        { variant: "error" }
      );
    }
  };
  
  // Stop recording and process the audio
  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;
    
    // Return a promise that resolves when the MediaRecorder stops
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve();
        return;
      }
      
      mediaRecorderRef.current.onstop = async () => {
        // Get all audio tracks from the stream and stop them
        const stream = mediaRecorderRef.current?.stream;
        stream?.getTracks().forEach(track => track.stop());
        
        try {
          // Convert audio chunks to WAV format
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          // Send the audio to the transcription API
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.wav');
          formData.append('lang', locale);
           const url = new URL(`/api/v1/voice_client/stt/${locale}`, location.origin);
          const response = await fetch(url, {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Transcription failed with status: ${response.status}`);
          }
          
          const data = await response.json();

          
          // If we got a transcribed text, send it through the chat
          if (data.text && data.text.trim()) {
            // Automatically send the transcribed message
            if (ws && isConnected) {
              const userMessage: Message = { role: "user", content: data.text };
              setMessages(prev => [...prev, userMessage]);
              
              ws.send(JSON.stringify({ data: data.text }));
              setIsGenerating(true);
            }
          }
        } catch (error) {       
          enqueueSnackbar(
            locale === "uz"
              ? "Ovozni transkripsiya qilishda xatolik yuz berdi"
              : locale === "ru"
              ? "Ошибка при транскрипции звука"
              : "Error transcribing audio",
            { variant: "error" }
          );
        }
        
        setIsRecording(false);
        resolve();
      };
      
      // Stop the recording
      mediaRecorderRef.current?.stop();
    });
  };

  return (
    <main className="flex h-screen w-full max-w-3xl flex-col items-center mx-auto">  

      {/* Messages container with fixed height and scroll */}
      <div className="flex-1 w-full overflow-hidden py-6 relative">
        <div className="absolute inset-0 overflow-y-auto">
          <ChatMessageList>
            {/* Show Hello Face if switch is ON */}
            {showHello ? (
              <div className="w-full shadow-sm rounded-lg p-8 flex flex-col gap-2 text-center">
                <span className="text-2xl font-bold text-white">Hello Face</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="w-full shadow-sm rounded-lg p-8 flex flex-col gap-2 text-center">
                {locale === "en" && "What can I help with?"}
                {locale === "uz" && "Qanday yordam bera olishim mumkin?"}
                {locale === "ru" && "Чем я могу помочь?"}
                <p className="text-muted-foreground text-sm">
                  {locale === "en" && "To start conversation, just type a message or click the microphone button to speak"}
                  {locale === "uz" && "Suhbatni boshlash uchun shunchaki xabar yozing yoki gapirish uchun mikrofon tugmasini bosing"}
                  {locale === "ru" && "Чтобы начать разговор, просто введите сообщение или нажмите кнопку микрофона, чтобы говорить."}
                </p>
              </div>
            ) : null}
            {/* Messages */}
            {!showHello &&
              messages &&
              messages.map((message, index) => (
                <ChatBubble
                  key={index}
                  variant={message.role === "user" ? "sent" : "received"}
                >
                  {/* <ChatBubbleAvatar
                    src=""
                    fallback={message.role === "user" ? "👨🏽" : "🤖"}
                  /> */}
                  <ChatBubbleMessage>
                    {/* Render message content */}
                    {message.content
                      .split("```")
                      .map((part: string, partIndex: number) => {
                        if (partIndex % 2 === 0) {
                          return (
                            <Markdown key={partIndex} remarkPlugins={[remarkGfm]}>
                              {part}
                            </Markdown>
                          );
                        } else {
                          return (
                            <pre className="whitespace-pre-wrap pt-2" key={partIndex}>
                              <CodeDisplayBlock code={part} lang="" />
                            </pre>
                          );
                        }
                      })}

                    {/* Render image if present */}
                    {message.image && <ImageDisplay base64Image={message.image} />}

                    {message.role === "assistant" &&
                      messages.length - 1 === index && (
                        <div className="flex items-center mt-1.5 gap-1">
                          {!isGenerating && (
                            <>
                              {ChatAiIcons.map((icon, iconIndex) => {
                                const Icon = icon.icon;
                                return (
                                  <ChatBubbleAction
                                    variant="outline"
                                    className="size-5"
                                    key={iconIndex}
                                    icon={<Icon className="size-3" />}
                                    onClick={() =>
                                      handleActionClick(icon.label, index)
                                    }
                                  />
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                  </ChatBubbleMessage>
                </ChatBubble>
              ))}

            {/* Loading */}
            {!showHello && isGenerating && (
              <ChatBubble variant="received">
                {/* <ChatBubbleAvatar src="" fallback="🤖" /> */}
                <ChatBubbleMessage isLoading />
              </ChatBubble>
            )}
          </ChatMessageList>
        </div>
      </div>

      {/* Form container */}
      <div className="w-full px-4 pb-4 flex-shrink-0">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
        >
          <ChatInput
            value={input}
            onKeyDown={onKeyDown}
            onChange={handleInputChange}
            placeholder={
              isConnected
                ? locale === "en"
                  ? "Type your message here..."
                  : locale === "uz"
                  ? "Xabarni shu yerga yozing..."
                  : "Введите здесь свое сообщение..."
                : locale === "en"
                ? "Connecting..."
                : locale === "uz"
                ? "Ulanmoqda..."
                : "Подключение..."
            }
            disabled={!isConnected}
            className="rounded-lg bg-background border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center p-3 pt-0">
            { <Button 
              variant="link" 
              size="icon"
              className={`${isRecording ? "bg-red-500" : ""}`}
              onClick={toggleRecording}
              type="button"
            >
              <Mic className="size-4" />
              <span className="sr-only">Record audio</span>
            </Button> }

            <Button
              disabled={!input || !isConnected}
              type="submit"
              size="dumaloq"
              className="ml-auto gap-1.5"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

// Main component with Suspense boundary
export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full max-w-3xl flex-col items-center mx-auto justify-center">
        <p>Loading chat...</p>
      </div>
    }>
      <ChatAppContent />
    </Suspense>
  );
}