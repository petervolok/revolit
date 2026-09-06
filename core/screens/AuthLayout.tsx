interface AuthLayoutProps {
  children: React.ReactNode;
  footnote?: string;
}

export default function AuthLayout({
  children,
  footnote = 'Вход защищён двухфакторной аутентификацией. Не сообщайте код подтверждения третьим лицам.',
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-9 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-semibold text-white">
              R
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-ink">Revolit</span>
          </div>

          {children}

          <p className="mt-10 text-xs leading-relaxed text-ink-faint">{footnote}</p>
        </div>
      </div>

      <div className="relative hidden flex-1 overflow-hidden bg-[#111219] lg:block">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgb(129 122 246) 0, transparent 45%), radial-gradient(circle at 75% 75%, rgb(79 70 229) 0, transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-16">
          <blockquote className="max-w-md">
            <p className="text-[22px] font-medium leading-snug tracking-tight text-white">
              Каждое рабочее место — со своим регламентом, правами и понятным интерфейсом.
            </p>
            <footer className="mt-4 text-sm text-white/50">
              Конструктор корпоративных систем Revolit
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
