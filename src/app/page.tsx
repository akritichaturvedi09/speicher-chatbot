import ChatbotWidget from "../components/ChatbotWidget";

export default function Home() {
  return (
  <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-100 via-white to-blue-200">
      <div className="flex items-center justify-center w-full h-full">
  <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center justify-center">
          <ChatbotWidget />
        </div>
      </div>
    </div>
  );
}
