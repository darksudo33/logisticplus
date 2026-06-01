import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, addMonths, format, getDay, getDaysInMonth, parse, startOfMonth, subMonths } from "date-fns-jalali";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const DEFAULT_TEHRAN_TIME = "09:00";

const persianDigitMap: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export const toEnglishDigits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (digit) => persianDigitMap[digit] || digit);

export const toPersianDigits = (value: number | string) =>
  String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

const pad = (value: string | number) => String(value).padStart(2, "0");

export function normalizeTehranTime(value?: string, fallback = DEFAULT_TEHRAN_TIME) {
  const normalized = toEnglishDigits(String(value || "")).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${pad(hour)}:${pad(minute)}`;
}

export function splitShamsiDateTime(value?: string, fallbackTime = DEFAULT_TEHRAN_TIME) {
  const raw = toEnglishDigits(String(value || "")).trim();
  if (!raw) return { date: "", time: fallbackTime };

  const dateTimeMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (dateTimeMatch) {
    const year = Number(dateTimeMatch[1]);
    if (year < 1700) {
      return {
        date: `${dateTimeMatch[1]}/${pad(dateTimeMatch[2])}/${pad(dateTimeMatch[3])}`,
        time: normalizeTehranTime(
          dateTimeMatch[4] !== undefined ? `${dateTimeMatch[4]}:${dateTimeMatch[5] || "00"}` : undefined,
          fallbackTime
        ),
      };
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      date: format(parsed, "yyyy/MM/dd"),
      time: format(parsed, "HH:mm"),
    };
  }

  return { date: "", time: fallbackTime };
}

export const getShamsiDatePart = (value?: string) => splitShamsiDateTime(value).date;

export const getTehranTimePart = (value?: string, fallbackTime = DEFAULT_TEHRAN_TIME) =>
  splitShamsiDateTime(value, fallbackTime).time;

export function combineShamsiDateTime(date?: string, time?: string, fallbackTime = DEFAULT_TEHRAN_TIME) {
  const datePart = splitShamsiDateTime(date, fallbackTime).date;
  if (!datePart) return "";
  return `${datePart} ${normalizeTehranTime(time, fallbackTime)}`;
}

export function parseShamsiDatePart(value?: string) {
  const datePart = getShamsiDatePart(value) || format(new Date(), "yyyy/MM/dd");
  const parsed = parse(datePart, "yyyy/MM/dd", new Date());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function parseShamsiDateTimeValue(value?: string, fallbackTime = DEFAULT_TEHRAN_TIME) {
  const { date, time } = splitShamsiDateTime(value, fallbackTime);
  if (!date) return null;
  const parsed = parse(date, "yyyy/MM/dd", new Date());
  if (Number.isNaN(parsed.getTime())) return null;
  const [hour, minute] = normalizeTehranTime(time, fallbackTime).split(":").map(Number);
  parsed.setHours(hour, minute, 0, 0);
  return parsed;
}

type ShamsiDateTimeFieldProps = {
  id?: string;
  label?: string;
  value?: string;
  date?: string;
  time?: string;
  onChange?: (value: string) => void;
  onDateChange?: (value: string) => void;
  onTimeChange?: (value: string) => void;
  defaultTime?: string;
  disabled?: boolean;
  required?: boolean;
  showTime?: boolean;
  className?: string;
  triggerClassName?: string;
};

const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const hourOptions = Array.from({ length: 24 }, (_, index) => pad(index));
const minuteOptions = Array.from({ length: 12 }, (_, index) => pad(index * 5));

export function ShamsiDateTimeField({
  id,
  label,
  value,
  date,
  time,
  onChange,
  onDateChange,
  onTimeChange,
  defaultTime = DEFAULT_TEHRAN_TIME,
  disabled,
  required,
  showTime = true,
  className,
  triggerClassName,
}: ShamsiDateTimeFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const splitValue = splitShamsiDateTime(value, defaultTime);
  const selectedDate = date !== undefined ? splitShamsiDateTime(date, defaultTime).date : splitValue.date;
  const selectedTime = normalizeTehranTime(time !== undefined ? time : splitValue.time, defaultTime);
  const [viewDate, setViewDate] = useState(() => parseShamsiDatePart(selectedDate));
  const selectedHour = selectedTime.split(":")[0] || "09";
  const selectedMinute = selectedTime.split(":")[1] || "00";

  useEffect(() => {
    if (open) setViewDate(parseShamsiDatePart(selectedDate));
  }, [open, selectedDate]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = containerRef.current?.querySelector("[data-testid='shamsi-date-time-trigger']");
      if (!(trigger instanceof HTMLElement)) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 12;
      const width = Math.min(360, Math.max(280, window.innerWidth - gutter * 2));
      const panelHeight = panelRef.current?.offsetHeight || 440;
      const belowTop = rect.bottom + 8;
      const aboveTop = rect.top - panelHeight - 8;
      const fitsBelow = belowTop + panelHeight <= window.innerHeight - gutter;
      const top = Math.max(gutter, fitsBelow ? belowTop : Math.max(gutter, aboveTop));
      const left = Math.min(
        window.innerWidth - width - gutter,
        Math.max(gutter, rect.right - width)
      );
      const maxHeight = Math.max(280, window.innerHeight - top - gutter);
      setPanelStyle({ left, top, width, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const firstDayOffset = (getDay(monthStart) + 1) % 7;
    const daysInMonth = getDaysInMonth(viewDate);
    return [
      ...Array.from({ length: firstDayOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => addDays(monthStart, index)),
    ];
  }, [viewDate]);

  const emitChange = (nextDate: string, nextTime: string) => {
    const normalizedTime = normalizeTehranTime(nextTime, defaultTime);
    onDateChange?.(nextDate);
    if (showTime) {
      onTimeChange?.(normalizedTime);
      onChange?.(combineShamsiDateTime(nextDate, normalizedTime, defaultTime));
    } else {
      onChange?.(nextDate);
    }
  };

  const handleDateSelect = (nextDate: Date) => {
    emitChange(format(nextDate, "yyyy/MM/dd"), selectedTime);
  };

  const handleTimeSelect = (nextHour: string, nextMinute: string) => {
    emitChange(selectedDate || format(new Date(), "yyyy/MM/dd"), `${nextHour}:${nextMinute}`);
  };

  const displayValue = selectedDate
    ? showTime
      ? `${toPersianDigits(selectedDate)}، ${toPersianDigits(selectedTime)} تهران`
      : toPersianDigits(selectedDate)
    : showTime
      ? "انتخاب تاریخ و ساعت تهران"
      : "انتخاب تاریخ";

  return (
    <div ref={containerRef} className={cn("relative space-y-2", className)} dir="rtl">
      {label && (
        <label htmlFor={id} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
          {required ? <span className="mr-1 text-destructive">*</span> : null}
        </label>
      )}
      <button
        id={id}
        data-testid="shamsi-date-time-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-right text-xs font-bold text-foreground shadow-inner outline-none transition hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span className={cn("truncate", !selectedDate && "text-muted-foreground")}>{displayValue}</span>
        </span>
        {showTime ? <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          data-testid="shamsi-date-time-panel"
          style={panelStyle}
          className="fixed z-[80] overflow-y-auto rounded-xl border border-border bg-card p-3 text-foreground shadow-2xl shadow-primary/10"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setViewDate(addMonths(viewDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-sm font-black text-foreground">{format(viewDate, "MMMM yyyy")}</div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setViewDate(subMonths(viewDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map((day) => (
              <div key={day} className="py-1 text-[10px] font-black text-muted-foreground">
                {day}
              </div>
            ))}
            {monthDays.map((day, index) => {
              const dayValue = day ? format(day, "yyyy/MM/dd") : "";
              const isSelected = dayValue === selectedDate;
              return day ? (
                <button
                  key={dayValue}
                  data-testid="shamsi-date-day"
                  type="button"
                  onClick={() => handleDateSelect(day)}
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-xs font-black transition hover:bg-primary/10 hover:text-primary",
                    isSelected ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground" : "text-foreground"
                  )}
                >
                  {toPersianDigits(format(day, "d"))}
                </button>
              ) : (
                <div key={`empty-${index}`} />
              );
            })}
          </div>

          {showTime ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/35 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black text-muted-foreground">
              <span>ساعت تهران</span>
              <span dir="ltr">{toPersianDigits(selectedTime)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                data-testid="shamsi-time-hour-select"
                value={selectedHour}
                onChange={(event) => handleTimeSelect(event.target.value, selectedMinute)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-center text-xs font-black outline-none focus:ring-2 focus:ring-primary/20"
                dir="ltr"
              >
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>{toPersianDigits(hour)}</option>
                ))}
              </select>
              <select
                data-testid="shamsi-time-minute-select"
                value={selectedMinute}
                onChange={(event) => handleTimeSelect(selectedHour, event.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-center text-xs font-black outline-none focus:ring-2 focus:ring-primary/20"
                dir="ltr"
              >
                {minuteOptions.map((minute) => (
                  <option key={minute} value={minute}>{toPersianDigits(minute)}</option>
                ))}
              </select>
            </div>
          </div>
          ) : null}
        </div>,
        document.body
      )}
    </div>
  );
}
