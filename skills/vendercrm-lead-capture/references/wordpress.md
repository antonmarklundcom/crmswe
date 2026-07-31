# WordPress

Hook the plugin the site already uses rather than replacing it — the client
knows their form builder, and the CRM only needs the submitted values.

Put the key in `wp-config.php`, above the "stop editing" line:

```php
define('VENDERCRM_API_KEY', 'vc_live_…');
define('VENDERCRM_URL', 'https://CRM_URL');
```

## Shared sender

In the child theme's `functions.php` (or a small mu-plugin, which survives
theme changes):

```php
<?php
/**
 * Posts a lead to VenderCRM. Never throws and never blocks the response:
 * the visitor's confirmation must not depend on the CRM being up.
 */
function vendercrm_send_lead(array $lead): void {
    $lead = array_filter($lead, static fn($v) => $v !== null && $v !== '');

    $response = wp_remote_post(VENDERCRM_URL . '/api/v1/leads', [
        'timeout' => 10,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Api-Key'    => VENDERCRM_API_KEY,
        ],
        'body' => wp_json_encode($lead),
    ]);

    if (is_wp_error($response)) {
        error_log('VenderCRM unreachable: ' . $response->get_error_message());
        return;
    }

    $code = wp_remote_retrieve_response_code($response);
    if ($code !== 201 && $code !== 200) {
        error_log("VenderCRM lead failed [$code] " . wp_remote_retrieve_body($response));
    }
}

/** Same phone within the same hour is the same submission. */
function vendercrm_idempotency_key(string $phone): string {
    return hash('sha256', $phone . '|' . gmdate('Y-m-d-H'));
}

function vendercrm_attribution(): array {
    if (empty($_COOKIE['vc_attr'])) {
        return [];
    }
    $decoded = json_decode(wp_unslash($_COOKIE['vc_attr']), true);
    return is_array($decoded) ? $decoded : [];
}

/** Attribution snippet on every page. */
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_script(
        'vendercrm-attribution',
        VENDERCRM_URL . '/vc-attribution.js',
        [],
        null,
        true
    );
});
```

## Contact Form 7

Field names below assume `your-name` / `your-tel` / `your-email` /
`your-message`; adjust to the actual form tags.

```php
add_action('wpcf7_mail_sent', function ($contact_form) {
    $submission = WPCF7_Submission::get_instance();
    if (!$submission) {
        return;
    }

    $data  = $submission->get_posted_data();
    $phone = trim($data['your-tel'] ?? '');
    if ($phone === '') {
        return;
    }

    $attr = vendercrm_attribution();

    vendercrm_send_lead([
        'phone'           => $phone,
        'name'            => $data['your-name'] ?? null,
        'email'           => $data['your-email'] ?? null,
        'message'         => $data['your-message'] ?? null,
        'source'          => 'cf7-' . $contact_form->id(),
        'page_url'        => $attr['landing_page'] ?? null,
        'utm_source'      => $attr['utm_source'] ?? null,
        'utm_campaign'    => $attr['utm_campaign'] ?? null,
        'gclid'           => $attr['gclid'] ?? null,
        'idempotency_key' => vendercrm_idempotency_key($phone),
    ]);
});
```

`wpcf7_mail_sent` fires only after CF7's own validation and spam checks pass,
so Akismet and any CAPTCHA already protect this path.

## WPForms

```php
add_action('wpforms_process_complete', function ($fields, $entry, $form_data) {
    // Map by field label so a reordered form doesn't silently break.
    $byLabel = [];
    foreach ($fields as $field) {
        $byLabel[strtolower($field['name'])] = $field['value'];
    }

    $phone = trim($byLabel['teléfono'] ?? $byLabel['telefono'] ?? '');
    if ($phone === '') {
        return;
    }

    $attr = vendercrm_attribution();

    vendercrm_send_lead([
        'phone'           => $phone,
        'name'            => $byLabel['nombre'] ?? null,
        'email'           => $byLabel['email'] ?? null,
        'message'         => $byLabel['mensaje'] ?? null,
        'source'          => 'wpforms-' . $form_data['id'],
        'utm_source'      => $attr['utm_source'] ?? null,
        'utm_campaign'    => $attr['utm_campaign'] ?? null,
        'idempotency_key' => vendercrm_idempotency_key($phone),
    ]);
}, 10, 3);
```

## Gravity Forms

```php
add_action('gform_after_submission', function ($entry, $form) {
    $phone = trim(rgar($entry, '3'));   // field IDs, check the form editor
    if ($phone === '') {
        return;
    }

    vendercrm_send_lead([
        'phone'           => $phone,
        'name'            => rgar($entry, '1'),
        'email'           => rgar($entry, '2'),
        'message'         => rgar($entry, '4'),
        'source'          => 'gravity-' . $form['id'],
        'idempotency_key' => vendercrm_idempotency_key($phone),
    ]);
}, 10, 2);
```

## Debugging

WordPress swallows `error_log` unless logging is on. In `wp-config.php`:

```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);   // keep errors off the live page
```

Then read `wp-content/debug.log`. Turn `WP_DEBUG` back off when finished.
