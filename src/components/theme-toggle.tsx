import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("ap-theme");
    const next = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ap-theme", next ? "dark" : "light");
  };
  return <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle color theme">{dark ? <Sun /> : <Moon />}</Button>;
}