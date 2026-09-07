import React, { useMemo, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type SearchResult = {
  title: string;
  url: string;
  source: string;
  snippet?: string;
  thumbnail?: string | null;
};

type FormatItem = {
  format_id: string;
  label: string;
  ext?: string | null;
  resolution?: string | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  has_video: boolean;
  has_audio: boolean;
};

type Probe = {
  title: string;
  webpage_url: string;
  thumbnail?: string | null;
  duration?: number | null;
  formats: FormatItem[];
};

const API = "https://seek-mvp.onrender.com";

function humanBytes(n?: number | null) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => probe?.formats.find((f) => f.format_id === selectedFormat),
    [probe, selectedFormat]
  );

  async function doSearch() {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setProbe(null);
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(query.trim())}`);
      if (!r.ok) throw new Error(await r.text());
      setResults(await r.json());
    } catch (e: any) {
      setError(e?.message || "Errore ricerca");
    } finally {
      setLoading(false);
    }
  }

  async function inspect(item: SearchResult) {
    setLoading(true);
    setError(null);
    setSelectedUrl(item.url);
    setProbe(null);
    setSelectedFormat(null);
    try {
      const r = await fetch(`${API}/media/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      if (!r.ok) throw new Error(await r.text());
      const p: Probe = await r.json();
      setProbe(p);
      if (p.formats.length) setSelectedFormat(p.formats[0].format_id);
    } catch (e: any) {
      setError(e?.message || "Questa sorgente non espone formati scaricabili");
    } finally {
      setLoading(false);
    }
  }

  async function downloadSelected() {
    if (!selectedUrl || !selectedFormat || !probe || !chosen) return;

    setError(null);

    try {
      const ext = chosen.ext || "bin";
      const filename = `${probe.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.${ext}`;
      const target = FileSystem.cacheDirectory + filename;

      const response = await fetch(`${API}/media/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: selectedUrl,
          format_id: selectedFormat,
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const reader = new FileReader();

      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onerror = reject;
        reader.onloadend = () => {
          const result = String(reader.result || "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(blob);
      });

      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const available = await Sharing.isAvailableAsync();

      if (available) {
        await Sharing.shareAsync(target, {
          dialogTitle: "Salva o condividi il file",
        });
      } else {
        setError(`File salvato in: ${target}`);
      }
    } catch (e: any) {
      setError(e?.message || "Errore durante il download");
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.logo}>SEEK</Text>
        <Text style={styles.tagline}>Trova. Scegli la qualità. Scarica.</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          placeholder="Titolo, persona, frase, dettaglio…"
          placeholderTextColor="#777"
          style={styles.input}
          returnKeyType="search"
        />
        <Pressable style={styles.searchButton} onPress={doSearch}>
          <Text style={styles.searchButtonText}>Cerca</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={{ margin: 18 }} /> : null}

      {probe ? (
        <ScrollView contentContainerStyle={styles.detail}>
          {probe.thumbnail ? <Image source={{ uri: probe.thumbnail }} style={styles.hero} /> : null}
          <Text style={styles.detailTitle}>{probe.title}</Text>
          <Text style={styles.sectionTitle}>Scegli qualità</Text>
          {probe.formats.map((f) => {
            const active = selectedFormat === f.format_id;
            return (
              <Pressable
                key={f.format_id}
                onPress={() => setSelectedFormat(f.format_id)}
                style={[styles.formatRow, active && styles.formatActive]}
              >
                <View>
                  <Text style={styles.formatLabel}>{f.label}</Text>
                  <Text style={styles.muted}>{f.format_id}</Text>
                </View>
                <Text style={styles.size}>{humanBytes(f.filesize || f.filesize_approx)}</Text>
              </Pressable>
            );
          })}

          <View style={styles.downloadBox}>
            <Text style={styles.downloadTitle}>Formato selezionato</Text>
            <Text style={styles.muted}>{chosen?.label || "—"}</Text>
            <Text style={styles.note}>
              Nel prototipo il download viene effettuato dal backend. Nel prossimo step colleghiamo
              questo pulsante al file system iOS/Android con progress bar e libreria locale.
            </Text>
            <Pressable
              disabled={!selectedUrl || !selectedFormat}
              style={[
                styles.downloadButton,
                (!selectedUrl || !selectedFormat) && { opacity: 0.4 },
              ]}
              onPress={downloadSelected}
            >
              <Text style={styles.downloadButtonText}>Scarica</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => setProbe(null)}>
            <Text style={styles.back}>← Torna ai risultati</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(x, i) => `${x.url}-${i}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => inspect(item)}>
              {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.source}>{item.source}</Text>
                {!!item.snippet && <Text numberOfLines={3} style={styles.snippet}>{item.snippet}</Text>}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>Scrivi qualcosa da cercare.</Text> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#09090b" },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  logo: { color: "white", fontSize: 34, fontWeight: "900", letterSpacing: 4 },
  tagline: { color: "#8c8c93", marginTop: 4 },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  input: { flex: 1, backgroundColor: "#17171b", color: "white", padding: 15, borderRadius: 16 },
  searchButton: { backgroundColor: "white", paddingHorizontal: 18, justifyContent: "center", borderRadius: 16 },
  searchButtonText: { color: "#09090b", fontWeight: "800" },
  error: { color: "#ff8787", paddingHorizontal: 18, paddingTop: 12 },
  list: { padding: 16, gap: 12 },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#141418", borderRadius: 18, padding: 12 },
  thumb: { width: 120, height: 80, borderRadius: 12, backgroundColor: "#222" },
  title: { color: "white", fontSize: 16, fontWeight: "700" },
  source: { color: "#9a9aa2", marginTop: 4, fontSize: 12 },
  snippet: { color: "#b8b8c0", marginTop: 6, lineHeight: 18 },
  empty: { color: "#777", textAlign: "center", marginTop: 60 },
  detail: { padding: 16, paddingBottom: 60 },
  hero: { width: "100%", aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: "#222" },
  detailTitle: { color: "white", fontSize: 22, fontWeight: "800", marginTop: 16 },
  sectionTitle: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  formatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: "#151519", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "transparent" },
  formatActive: { borderColor: "white" },
  formatLabel: { color: "white", fontWeight: "700" },
  muted: { color: "#85858e", marginTop: 3 },
  size: { color: "#bdbdc4", fontWeight: "700" },
  downloadBox: { marginTop: 20, padding: 16, backgroundColor: "#141418", borderRadius: 18 },
  downloadTitle: { color: "white", fontWeight: "800", fontSize: 17 },
  note: { color: "#9b9ba4", lineHeight: 19, marginTop: 12 },
  downloadButton: { marginTop: 16, backgroundColor: "white", padding: 15, borderRadius: 14, alignItems: "center" },
  downloadButtonText: { color: "#09090b", fontWeight: "900" },
  back: { color: "white", textAlign: "center", marginTop: 24, fontWeight: "700" },
});
