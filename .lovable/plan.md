

# Fix: Upload de Imagens DLO via Multipart (Bypass do erro #3 e do download falho)

## Problema

Duas abordagens ja falharam para imagens no DLO:
1. `POST /adimages` com parametro `url` -> Erro #3 (permissao do App)
2. `url` direto no `asset_feed_spec.images` -> Erro 3858258 (Facebook nao consegue baixar do Supabase Storage)

## Solucao

A Edge Function faz `fetch()` da imagem do Supabase Storage, recebe os bytes como `Blob`, e envia via `FormData` (multipart) para `POST /adimages`. Isso evita tanto o erro #3 quanto o problema de download, e nao usa `btoa(String.fromCharCode(...))` que causa stack overflow.

```text
Supabase Storage -> fetch() na Edge Function -> Blob em memoria
                                                    |
                    FormData + Blob -> POST /{act_id}/adimages (multipart)
                                                    |
                    Facebook retorna image_hash -> Usa no asset_feed_spec
```

## Mudancas no codigo

Todas em `supabase/functions/process-campaign-jobs/index.ts`:

### 1. `uploadDLOMediaForAccount` — bloco `else` (imagem), linhas ~1680-1684

Substituir o bypass de URL direta por:

```typescript
} else {
  // Download image from storage and upload via multipart FormData
  // (avoids error #3 from url param AND download failures from direct URL)
  const imgResponse = await fetch(mediaUrl);
  if (!imgResponse.ok) {
    throw new Error(`Failed to download image for locale ${localeKey}: HTTP ${imgResponse.status}`);
  }
  const imgBlob = await imgResponse.blob();

  const formData = new FormData();
  formData.append('access_token', accessToken);
  formData.append('filename', `dlo_${localeKey}.jpg`);
  formData.append('file', imgBlob, `dlo_${localeKey}.jpg`);

  const result = await fetchWithRetry(
    `${GRAPH_BASE_URL}/${actId}/adimages`,
    {
      method: 'POST',
      body: formData,
      // No Content-Type header — FormData sets it with boundary automatically
    },
    3,
    adAccountId,
  );

  if (!result.ok || result.json.error) {
    throw new Error(`Image upload failed for locale ${localeKey}: ${result.json?.error?.message || 'unknown'}`);
  }

  const imagesObj = result.json?.images;
  if (imagesObj) {
    const firstKey = Object.keys(imagesObj)[0];
    if (firstKey && imagesObj[firstKey]?.hash) {
      mediaMap[localeKey] = imagesObj[firstKey].hash;
    }
  }

  if (!mediaMap[localeKey]) {
    throw new Error(`Image upload returned no hash for locale ${localeKey}`);
  }

  console.log(`[DLO] Uploaded image for locale ${localeKey}: ${mediaMap[localeKey]}`);
}
```

### 2. `buildDLOCreative` — bloco de imagem, linhas ~1738-1743

Reverter de `url` para `hash` (agora temos o hash real de volta):

```typescript
} else if (mediaType === 'image' && mediaId) {
  mediaAssets.push({
    hash: mediaId, // mediaId contains the image_hash from /adimages upload
    adlabels: [{ name: `${prefix}_media` }],
  });
}
```

### 3. Nada mais muda

- Upload de video continua via `/advideos` com `file_url` (funciona)
- Idempotencia continua igual (`savedDLOMedia` salva hashes para imagens, video_ids para videos)
- Batch de ads, `asset_feed_spec`, `customization_rules` — tudo inalterado

## Ponto critico: Memoria

Usar `FormData` com `Blob` nativo do Deno e seguro. O Blob nao e convertido para string base64 em nenhum momento — vai direto como stream binario no multipart. Imagens de ate ~20MB devem funcionar sem problemas no limite de memoria das Edge Functions.

## Risco

Se a imagem for muito grande (>20MB), pode estourar a memoria da Edge Function durante o `fetch()`. Isso e o mesmo risco que ja existe para videos. A recomendacao e manter imagens abaixo de 10MB.

