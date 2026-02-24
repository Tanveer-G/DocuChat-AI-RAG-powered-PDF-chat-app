"use client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Role } from "@/types/chat";

interface RoleSelectorProps {
  value: Role;
  onChange: (value: Role) => void;
  disabled?: boolean;
}

const roleLabels: Record<Role, string> = {
  strict_qa: "Strict Q&A",
  advocate: "Advocate",
  concise_hr: "Concise HR",
  interview_coach: "Interview Coach",
  technical_explainer: "Technical Explainer",
  friend: "Friend",
  storyteller: "Storyteller",
};

export function RoleSelector({ value, onChange, disabled }: Readonly<RoleSelectorProps>) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="role-select" className="text-sm whitespace-nowrap">
        Tone:
      </Label>
      <Select
        value={value}
        onValueChange={(val: string) => onChange(val as Role)}
        disabled={disabled}
      >
        <SelectTrigger id="role-select" className="w-45">
          <SelectValue placeholder="Select a tone" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(roleLabels).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}