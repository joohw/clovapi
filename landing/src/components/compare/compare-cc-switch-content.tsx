"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";

const COMPARE_ROWS = [
  { key: "multiCli", clovapi: true, ccSwitch: false },
  { key: "codex", clovapi: true, ccSwitch: false },
  { key: "apiStyle", clovapi: true, ccSwitch: false },
  { key: "claudeCode", clovapi: true, ccSwitch: true },
  { key: "openSource", clovapi: true, ccSwitch: true },
  { key: "desktop", clovapi: true, ccSwitch: false },
] as const;

function CellValue({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={value ? "text-foreground" : "text-muted-foreground"}>
      {value ? t("compare.yes") : t("compare.no")}
    </span>
  );
}

export function CompareCcSwitchContent() {
  const { t } = useTranslation();

  return (
    <div className="page-wrap relative">
      <div className="relative z-[1] mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("compare.title")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("compare.subtitle")}</p>

        <div className="mt-10 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr>
                <th className="px-4 py-3 font-semibold text-foreground">{t("compare.feature")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">clovapi</th>
                <th className="px-4 py-3 font-semibold text-foreground">cc-switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {COMPARE_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 text-foreground">{t(`compare.rows.${row.key}`)}</td>
                  <td className="px-4 py-3">
                    <CellValue value={row.clovapi} />
                  </td>
                  <td className="px-4 py-3">
                    <CellValue value={row.ccSwitch} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold text-foreground">{t("compare.whenClovapiTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("compare.whenClovapiBody")}</p>
        </section>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-xl font-semibold text-foreground">{t("compare.whenCcSwitchTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("compare.whenCcSwitchBody")}</p>
        </section>

        <ClientDownloadButtons className="mt-8" />

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/agents" className="text-foreground underline-offset-4 hover:underline">
            {t("compare.agentsLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
