import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  getEditorModels,
  getEditorSchema,
  getEditorRecords,
  getEditorOptions,
  createEditorRecord,
  updateEditorRecord,
  deleteEditorRecord,
  type ModelMeta,
  type FieldDef,
  type RecordData,
  type RelatedOption,
} from "@/api/editor";

// ─── Field Input ──────────────────────────────────────────────────────────────

type FieldInputProps = {
  field: FieldDef;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  relatedOptions: Record<string, RelatedOption[]>;
};

function FieldInput({ field, value, onChange, relatedOptions }: FieldInputProps) {
  const { t } = useTranslation();
  const { type, name, label, options, required, related_model } = field;

  switch (type) {
    case "Boolean":
      return (
        <div className="flex items-center gap-3">
          <Switch
            id={name}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(name, checked)}
          />
          <Label htmlFor={name}>{label}</Label>
        </div>
      );

    case "Integer":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="number"
            step="1"
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(name, e.target.value === "" ? null : parseInt(e.target.value, 10))}
          />
        </div>
      );

    case "Float":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="number"
            step="any"
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(name, e.target.value === "" ? null : parseFloat(e.target.value))}
          />
        </div>
      );

    case "Password":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="password"
            placeholder={t("editor.field.passwordPlaceholder")}
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(name, e.target.value || null)}
          />
        </div>
      );

    case "Select":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Select
            value={value == null ? "" : String(value)}
            onValueChange={(v) => onChange(name, v)}
          >
            <SelectTrigger id={name}>
              <SelectValue placeholder={t("editor.field.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {(options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "Color":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="color"
            value={value == null ? "#000000" : String(value)}
            onChange={(e) => onChange(name, e.target.value)}
            className="h-10 w-20 cursor-pointer p-1"
          />
        </div>
      );

    case "Date":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="date"
            value={value == null ? "" : String(value).slice(0, 10)}
            onChange={(e) => onChange(name, e.target.value || null)}
          />
        </div>
      );

    case "DateTime":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="datetime-local"
            value={value == null ? "" : String(value).slice(0, 16)}
            onChange={(e) => onChange(name, e.target.value || null)}
          />
        </div>
      );

    case "Picture":
    case "EditablePicture":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          {value && (
            <p className="text-xs text-muted-foreground">{t("editor.field.currentImageId", { id: String(value) })}</p>
          )}
          <Input
            id={name}
            type="file"
            accept="image/*"
            onChange={(e) => onChange(name, e.target.files?.[0] ?? null)}
          />
        </div>
      );

    case "MultiplePictures":
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onChange(name, e.target.files ? Array.from(e.target.files) : [])}
          />
        </div>
      );

    case "ManyToOne": {
      const opts = related_model ? (relatedOptions[related_model] ?? []) : [];
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Select
            value={value == null ? "" : String(value)}
            onValueChange={(v) => onChange(name, v === "" ? null : parseInt(v, 10))}
          >
            <SelectTrigger id={name}>
              <SelectValue placeholder={t("editor.field.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("editor.field.none")}</SelectItem>
              {opts.map((opt) => (
                <SelectItem key={opt.id} value={String(opt.id)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    case "ManyToMany":
    case "OneToMany": {
      const opts = related_model ? (relatedOptions[related_model] ?? []) : [];
      const selected: number[] = Array.isArray(value) ? (value as number[]) : [];
      return (
        <div className="space-y-1">
          <Label>{label}{required && " *"}</Label>
          <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
            {opts.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt.id]
                      : selected.filter((id) => id !== opt.id);
                    onChange(name, next);
                  }}
                />
                {opt.label}
              </label>
            ))}
            {opts.length === 0 && <p className="text-xs text-muted-foreground">{t("editor.field.noOptions")}</p>}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="space-y-1">
          <Label htmlFor={name}>{label}{required && " *"}</Label>
          <Input
            id={name}
            type="text"
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(name, e.target.value || null)}
          />
        </div>
      );
  }
}

// ─── Record Sheet ─────────────────────────────────────────────────────────────

type RecordSheetProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  model: string;
  fields: FieldDef[];
  record: RecordData | null;
  relatedOptions: Record<string, RelatedOption[]>;
  onSaved: () => void;
};

function RecordSheet({
  open,
  onClose,
  mode,
  model,
  fields,
  record,
  relatedOptions,
  onSaved,
}: RecordSheetProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<RecordData>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(record ? { ...record } : {});
    }
  }, [open, record]);

  function handleChange(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      // Strip null password fields on edit (don't overwrite with blank)
      const payload: RecordData = {};
      for (const field of fields) {
        const v = values[field.name];
        if (field.type === "Password" && (v == null || v === "")) continue;
        if (field.type === "Picture" || field.type === "EditablePicture" || field.type === "MultiplePictures") continue;
        payload[field.name] = v;
      }

      if (mode === "create") {
        await createEditorRecord(model, payload);
        toast.success(t("editor.toast.recordCreated"));
      } else {
        await updateEditorRecord(model, values.id as number, payload);
        toast.success(t("editor.toast.recordUpdated"));
      }
      onSaved();
      onClose();
    } catch {
      toast.error(t("editor.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? t("editor.sheet.newTitle") : t("editor.sheet.editTitle")}</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name] ?? null}
              onChange={handleChange}
              relatedOptions={relatedOptions}
            />
          ))}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("editor.sheet.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t("editor.sheet.saving") : t("editor.sheet.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const { t } = useTranslation();
  const { model: modelParam } = useParams<{ model?: string }>();
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelMeta[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(modelParam ?? null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [relatedOptions, setRelatedOptions] = useState<Record<string, RelatedOption[]>>({});
  const [records, setRecords] = useState<RecordData[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "edit">("create");
  const [activeRecord, setActiveRecord] = useState<RecordData | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<RecordData | null>(null);

  // Load models list on mount
  useEffect(() => {
    getEditorModels()
      .then(setModels)
      .catch(() => toast.error(t("editor.toast.loadModelsFailed")))
      .finally(() => setLoadingModels(false));
  }, []);

  // Sync URL param → selectedModel
  useEffect(() => {
    if (modelParam && modelParam !== selectedModel) {
      setSelectedModel(modelParam);
      setPage(1);
      setSearch("");
    }
  }, [modelParam]);

  // Load schema + related options when model changes
  useEffect(() => {
    if (!selectedModel) return;
    setFields([]);
    setRelatedOptions({});

    getEditorSchema(selectedModel).then(async (schema) => {
      setFields(schema);
      const relModels = [...new Set(
        schema
          .filter((f) => f.related_model && ["ManyToOne", "ManyToMany", "OneToMany"].includes(f.type))
          .map((f) => f.related_model!)
      )];
      const entries = await Promise.all(
        relModels.map((m) =>
          getEditorOptions(m)
            .then((opts) => [m, opts] as const)
            .catch(() => [m, []] as const)
        )
      );
      setRelatedOptions(Object.fromEntries(entries));
    }).catch(() => toast.error(t("editor.toast.loadSchemaFailed")));
  }, [selectedModel]);

  // Load records when model/page/search changes
  const loadRecords = useCallback(() => {
    if (!selectedModel) return;
    setLoadingRecords(true);
    getEditorRecords(selectedModel, page, search || undefined)
      .then((data) => {
        setRecords(data.items);
        setTotal(data.total);
        setPages(data.pages);
      })
      .catch(() => toast.error(t("editor.toast.loadRecordsFailed")))
      .finally(() => setLoadingRecords(false));
  }, [selectedModel, page, search]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function selectModel(key: string) {
    setSelectedModel(key);
    setPage(1);
    setSearch("");
    navigate(`/editor/${key}`);
  }

  function openCreate() {
    setActiveRecord(null);
    setSheetMode("create");
    setSheetOpen(true);
  }

  function openEdit(record: RecordData) {
    setActiveRecord(record);
    setSheetMode("edit");
    setSheetOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget || !selectedModel) return;
    try {
      await deleteEditorRecord(selectedModel, deleteTarget.id as number);
      toast.success(t("editor.toast.recordDeleted"));
      setDeleteTarget(null);
      loadRecords();
    } catch {
      toast.error(t("editor.toast.deleteFailed"));
    }
  }

  const currentModelMeta = models.find((m) => m.key === selectedModel);
  const listColumns = currentModelMeta?.listColumns ?? [];

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Model sidebar */}
        <aside className="w-56 shrink-0 border-r bg-muted/30 overflow-y-auto">
          <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("editor.models")}
          </div>
          {loadingModels ? (
            <div className="p-4 text-sm text-muted-foreground">{t("editor.loading")}</div>
          ) : (
            <ul>
              {models.map((m) => (
                <li key={m.key}>
                  <button
                    onClick={() => selectModel(m.key)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                      selectedModel === m.key ? "bg-accent font-medium" : ""
                    }`}
                  >
                    {m.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedModel ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              {t("editor.selectModelPrompt")}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 p-4 border-b shrink-0">
                <h2 className="text-lg font-semibold mr-2">
                  {currentModelMeta?.title ?? selectedModel}
                </h2>
                <Input
                  placeholder={t("editor.searchPlaceholder")}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="max-w-xs"
                />
                <div className="ml-auto">
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-1" />
                    {t("editor.new")}
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {loadingRecords ? (
                  <div className="p-6 text-muted-foreground">{t("editor.loadingRecords")}</div>
                ) : records.length === 0 ? (
                  <div className="p-6 text-muted-foreground">{t("editor.noRecordsFound")}</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">{t("editor.columnId")}</th>
                        {listColumns.map((col) => (
                          <th key={col.field} className="text-left px-3 py-2 font-medium text-muted-foreground">
                            {col.label}
                          </th>
                        ))}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr
                          key={String(record.id)}
                          className="border-b hover:bg-muted/40 cursor-pointer"
                          onClick={() => openEdit(record)}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{String(record.id)}</td>
                          {listColumns.map((col) => (
                            <td key={col.field} className="px-3 py-2 max-w-xs truncate">
                              {record[col.field] == null ? (
                                <span className="text-muted-foreground italic">—</span>
                              ) : (
                                String(record[col.field])
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(record)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t shrink-0 text-sm">
                  <span className="text-muted-foreground">
                    {t("editor.pagination", { total, page, pages })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Record Sheet */}
      <RecordSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mode={sheetMode}
        model={selectedModel ?? ""}
        fields={fields}
        record={activeRecord}
        relatedOptions={relatedOptions}
        onSaved={loadRecords}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.delete.description", { id: String(deleteTarget?.id) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("editor.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
