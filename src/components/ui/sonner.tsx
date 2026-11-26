import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:max-w-[min(420px,calc(100vw-24px))] group-[.toaster]:whitespace-normal group-[.toaster]:break-words",
          title: "group-[.toast]:whitespace-normal group-[.toast]:break-words group-[.toast]:leading-snug",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:whitespace-normal group-[.toast]:break-words",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
