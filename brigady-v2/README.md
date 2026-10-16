# Evidence brigád 2.0

Osobní webová aplikace v češtině pro evidenci brigád. Navazuje na původní jednosouborovou verzi a přidává zaměstnavatele, plánování v kalendáři a statistiky za celý rok.

## Spuštění

1. Rozbal celý ZIP.
2. Ve složce `brigady-v2` otevři `index.html` v aktuálním prohlížeči.
3. Ponech vedle něj `style.css`, `core.js` a `app.js`.
4. Pro ukázková data otevři **Data a zálohy → Vyzkoušet ukázková data**. Na počítači je ukázka dostupná i vlevo dole.

Aplikace nepoužívá externí knihovny, síťové požadavky ani server. Po rozbalení funguje offline. Nepoužívá JavaScript moduly ani fetch, aby šla spustit také dvojklikem na soubor.

Pro každodenní používání je vhodná stále stejná adresa na GitHub Pages. Chování localStorage u lokálních souborů se může lišit mezi prohlížeči. Při změně adresy nebo zařízení přenes data pomocí JSON zálohy.

## Publikování na školním GitHub Pages

Do svého již publikovaného repozitáře nahraj celou složku `brigady-v2`, včetně všech čtyř souborů aplikace. ZIP do repozitáře nenahrávej místo rozbalených souborů: GitHub Pages jej sám nerozbalí.

Pokud zachováš umístění v repozitáři `markqtn/SPSD-Nahornyi`, nová verze bude po úspěšném publikování dostupná na:

https://markqtn.github.io/SPSD-Nahornyi/brigady-v2/

Tento balíček ještě sám o sobě nezveřejňuje novou verzi. Původní HTML může zůstat v repozitáři vedle nové složky.

## Soubory a jejich role

| Soubor | Úloha |
| --- | --- |
| index.html | Struktura stránky, jednotlivé pohledy, formuláře a dialogy |
| style.css | Rozvržení, barvy a přizpůsobení mobilním obrazovkám |
| core.js | Datový model, validace, výpočty, převod záloh v1 a export CSV |
| app.js | Navigace, vykreslení kalendáře a tabulek, akce formulářů, localStorage |
| README.md | Návod a popis projektu |

Jde o jednu aplikaci se šesti pohledy a více propojenými soubory. HTML načte CSS a oba JavaScript soubory. core.js musí být načten před app.js. Zálohy JSON jsou samostatné soubory s uživatelskými daty.

## Funkce

- **Přehled:** souhrn vybraného měsíce, výdělky za 12 měsíců, nejbližší plány.
- **Moje směny:** přidávání, úpravy a mazání, hledání, filtr období, zaměstnavatele a stavu. CSV obsahuje přesně vyfiltrované směny.
- **Kalendář:** měsíční přehled od pondělí, výběr dne, detail směn, přidání směny do vybraného dne, barvy podle zaměstnavatele.
- **Zaměstnavatelé:** vlastní výchozí sazba, barva, úpravy a archivace. Profil bez směn lze i smazat. Archivace uchová historické směny.
- **Roční statistiky:** výběr roku a zaměstnavatele, přehled všech 12 měsíců, výdělky a hodiny po zaměstnavatelích.
- **Data a zálohy:** úplná JSON záloha, obnova JSON v1/v2 s náhledem a potvrzením, oddělený ukázkový režim.
- Upozornění na časově se překrývající směny včetně přechodu přes půlnoc.
- Kontrola neplatných dat a ochrana proti přepsání novějších údajů z jiné karty prohlížeče.

## První použití a přenos starých směn

Nová evidence je prázdná. Nejdřív vytvoř zaměstnavatele a nastav jeho sazbu. Při kliknutí na „Přidat směnu“ bez zaměstnavatele se automaticky otevře jeho vytvoření.

Ze staré aplikace použij „Stáhnout zálohu JSON“. V nové aplikaci otevři „Data a zálohy“, vyber zálohu a potvrď obnovení. Import nahradí celou aktuální evidenci, proto nejdřív stáhni její zálohu. Současná data lze zálohovat i přímo v potvrzovacím dialogu.

Verze 1 nerozlišovala zaměstnavatele od místa či názvu brigády. Proto se všechny původní směny převedou do profilu **Původní evidence**. Tento profil lze přejmenovat. Pro více zaměstnavatelů vytvoř další profily a uprav přiřazení konkrétních směn. Při změně zaměstnavatele formulář nabídne jeho výchozí sazbu; před uložením ji případně uprav na původní hodnotu. Samotný import vždy zachová původní sazby, částky, poznámky a vyplacení.

Původní směny se importují jako odpracované, protože v1 neměla stav „plánováno“. Pokud některá směna ještě neproběhla, můžeš její stav změnit. Pokud nová verze na stejné doméně najde úložiště v1 a ještě nemá vlastní uložená data, nabídne jednorázový převod. Původní úložiště tím nemaže.

## Pravidla výpočtu

Výdělek směny = placené minuty / 60 × sazba u konkrétní směny.

- Pauza je neplacená. Musí být kratší než délka směny.
- Částka každé směny se zaokrouhlí na haléře; součty se počítají v haléřích.
- Sazba je uložena u směny. Změna výchozí sazby zaměstnavatele nemění historické směny.
- Konec před začátkem znamená následující den. Shodné časy nejsou povolené. Směna je kratší než 24 hodin.
- Přechody letního/zimního času se nezohledňují.
- Celá směna patří do měsíce a roku svého začátku, včetně směny přes Silvestra.
- Výdělek, odpracované hodiny a nevyplacená částka zahrnují jen stav **Odpracováno**.
- Plány mají samostatný počet hodin a odhad výdělku. Plán nelze označit jako vyplacený.
- Minulá plánovaná směna se sama nepřepne na odpracovanou. Uživatel ji musí potvrdit úpravou stavu.
- Měsíční filtry platí pro Přehled, Moje směny a Kalendář. Seznam umí i všechny měsíce. Roční statistiky mají samostatný výběr roku.
- Přehled zaměstnavatelů na jejich kartách se vztahuje k aktuálnímu kalendářnímu roku.
- Daně, odvody, příplatky, částečné platby a zákonné limity aplikace nepočítá. Částky představují evidovaný výdělek před srážkami.

## Ukládání a soukromí

Data se ukládají pouze v localStorage tohoto prohlížeče (klíč `evidence-brigad-v2`). Nikam se neodesílají a mezi zařízeními se nesynchronizují. Vymazání dat prohlížeče může odstranit i evidenci. JSON zálohy obsahují osobní záznamy; pro zveřejnění aplikace stačí soubory aplikace, zálohu není potřeba nahrávat na GitHub.

Pokud úložiště není dostupné nebo je plné, aplikace upozorní, že změny zůstaly jen v paměti. V takovém případě před zavřením stránky stáhni JSON. Po změně dat v jiné kartě obnov stránku před dalším ukládáním.

Limity: 10 000 směn, 1 000 zaměstnavatelů, záloha do 10 MB, data v letech 1900–2100.

## Ukázka pro prezentaci ve škole

1. Zapni ukázková data.
2. Ukaž tři zaměstnavatele s odlišnými sazbami a barvami.
3. Přidej plánovanou směnu v kalendáři a přepni ji na odpracovanou.
4. Změň výchozí sazbu zaměstnavatele a ukaž, že starší směny drží svou sazbu.
5. Otevři statistiky za celý rok a filtruj zaměstnavatele.
6. Exportuj JSON nebo filtrované CSV.
7. Ukaž rozdělení projektu do HTML, CSS a dvou JavaScript souborů.

Ukázkový režim nemění vlastní evidenci. Po jeho ukončení se vrátí původní data, změny ukázky se zahodí.
