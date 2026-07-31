# Static HTML + PHP

The default for Hostinger shared hosting. Also the source of the form markup
used by every other stack.

## The form

```html
<form action="/contacto.php" method="POST">
  <label>Nombre
    <input name="nombre" required autocomplete="name">
  </label>

  <label>WhatsApp
    <input name="telefono" type="tel" required autocomplete="tel"
           placeholder="0981 123 456" inputmode="tel">
  </label>

  <label>Email (opcional)
    <input name="email" type="email" autocomplete="email">
  </label>

  <label>¿En qué te podemos ayudar?
    <textarea name="mensaje" rows="4"></textarea>
  </label>

  <!-- Honeypot: bots fill it, humans never see it. -->
  <input name="website" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true">

  <button type="submit">Enviar</button>
</form>

<!-- On every page, not just this one: first-touch attribution. -->
<script src="https://CRM_URL/vc-attribution.js" defer></script>
```

Notes that matter in practice: `type="tel"` + `inputmode="tel"` gives the right
keyboard on phones, which is where most of this traffic converts. Keep the
phone field required — a lead without a phone can't become a contact.

## The handler

`contacto.php`:

```php
<?php
declare(strict_types=1);

const VENDERCRM_URL = 'https://CRM_URL';
const THANK_YOU     = '/gracias.html';

// 1. Honeypot — accept silently so the bot sees success and moves on.
if (!empty($_POST['website'])) {
    header('Location: ' . THANK_YOU);
    exit;
}

$phone = trim((string)($_POST['telefono'] ?? ''));
if ($phone === '') {
    header('Location: /contacto.html?error=telefono');
    exit;
}

// 2. First-touch attribution written by vc-attribution.js.
$attr = [];
if (!empty($_COOKIE['vc_attr'])) {
    $decoded = json_decode($_COOKIE['vc_attr'], true);
    if (is_array($decoded)) {
        $attr = $decoded;
    }
}

// 3. Stable idempotency key: same phone within the same hour is the same
//    submission, so a double-click or a retry can't duplicate the contact.
$idempotencyKey = hash('sha256', $phone . '|' . gmdate('Y-m-d-H'));

$payload = [
    'phone'           => $phone,
    'name'            => $_POST['nombre']  ?? null,
    'email'           => $_POST['email']   ?? null,
    'message'         => $_POST['mensaje'] ?? null,
    'source'          => 'formulario-contacto',
    'page_url'        => $attr['landing_page'] ?? null,
    'referrer'        => $attr['referrer']     ?? null,
    'utm_source'      => $attr['utm_source']   ?? null,
    'utm_medium'      => $attr['utm_medium']   ?? null,
    'utm_campaign'    => $attr['utm_campaign'] ?? null,
    'utm_term'        => $attr['utm_term']     ?? null,
    'utm_content'     => $attr['utm_content']  ?? null,
    'gclid'           => $attr['gclid']        ?? null,
    'fbclid'          => $attr['fbclid']       ?? null,
    'idempotency_key' => $idempotencyKey,
];

// Drop empties — the API rejects '' for email rather than ignoring it.
$payload = array_filter($payload, static fn($v) => $v !== null && $v !== '');

$ch = curl_init(VENDERCRM_URL . '/api/v1/leads');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-Api-Key: ' . (getenv('VENDERCRM_API_KEY') ?: ''),
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);

$response = curl_exec($ch);
$status   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

// 4. Never block the visitor. Log and thank them either way.
if ($status !== 201 && $status !== 200) {
    error_log(sprintf('VenderCRM lead failed [%d] %s %s', $status, $response, $curlErr));
}

header('Location: ' . THANK_YOU);
exit;
```

## Reading the key on shared hosting

`getenv()` returning `false` is the most common cause of silent `401`s. On
Hostinger, set the variable in hPanel; if that isn't available, a
`.env`-style include kept **outside** the web root works:

```php
// /home/user/private/vendercrm.php  — NOT under public_html
return ['api_key' => 'vc_live_…'];
```

```php
$config = require '/home/user/private/vendercrm.php';
// … 'X-Api-Key: ' . $config['api_key']
```

Never place that file under `public_html`, and never commit it.

## Multiple forms on one site

Reuse the same handler and set `source` per form so the CRM shows where each
lead came from:

```php
'source' => $_POST['form_id'] ?? 'formulario-contacto',
```

with `<input type="hidden" name="form_id" value="presupuesto-techos">` in the
form. Same key, same site, distinguishable leads.
