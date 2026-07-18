import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolveTransferSearch } from "@/lib/transferMarket";

// Поиск по рынку трансферов задаётся фильтрами прямо в браузере (возраст +
// основной навык — оба обязательны для transfersearch.xml), поэтому
// запрашивается "по требованию" при отправке формы, а не заранее при
// загрузке страницы (см. src/components/dashboard/TransferSearchPanel.tsx).
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const ageMin = Number(params.get("ageMin"));
  const ageMax = Number(params.get("ageMax"));
  const skillType = Number(params.get("skillType"));
  const skillMin = Number(params.get("skillMin"));
  const skillMax = Number(params.get("skillMax"));

  if ([ageMin, ageMax, skillType, skillMin, skillMax].some((v) => Number.isNaN(v))) {
    return NextResponse.json({ error: "Не заданы обязательные параметры поиска (возраст, тип навыка, диапазон навыка)" }, { status: 400 });
  }

  const result = await resolveTransferSearch(tokens, { ageMin, ageMax, skillType, skillMin, skillMax });
  return NextResponse.json(result);
}
