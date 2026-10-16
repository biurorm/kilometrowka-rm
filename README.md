# Kilometrówka RM

PWA do ewidencji przejazdów prywatnym autem do celów służbowych (jazdy lokalne) i PDF dla księgowej. Zbudowana 16.10.2026 dla Anety.

- **Przejazd:** start z biura, punkty po kolei (podpowiedzi: ostatnio używane + mapa Photon/OpenStreetMap), „Powrót do biura”, km liczone same trasą samochodem (OSRM), do poprawienia ręcznie, cel wyjazdu jednym kliknięciem.
- **Przejazdy:** miesiąc, suma km i zł, Edytuj / Powtórz dziś / Usuń.
- **PDF:** ewidencja za miesiąc (wszystkie pola z art. 23 ust. 7 PIT, Lp., suma, podpisy), pobranie i „Wyślij” z telefonu.
- **⚙:** imię i nazwisko, adres, auto, nr rej., pojemność, stawka (domyślnie 1,15 zł/km), adres biura.

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie. Tabele `przejazdy`, `km_ustawienia` z `setup.sql`. Każdy widzi swoje, menedżer (admin) wszystkich i wybiera osobę chipem.
Tryb próbny: `index.html?proba` (dane w przeglądarce).

Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
