<?php
/**
 * Turgenev settings UI.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Admin;

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Api\ApiException;
use Al5dy\Turgenev\Support\OptionStore;

defined( 'ABSPATH' ) || exit;

/** Secret-safe settings UI and non-destructive key rotation. */
final class SettingsPage {
	/**
	 * Stored configuration.
	 *
	 * @var OptionStore
	 */
	private OptionStore $options;

	/**
	 * Bind configuration access.
	 *
	 * @param OptionStore $options Configuration store.
	 */
	public function __construct( OptionStore $options ) {
		$this->options = $options;
	}

	/** Register the admin settings hooks. */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'addPage' ) );
		add_action( 'admin_init', array( $this, 'registerSettings' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( TURGENEV_FILE ), array( $this, 'actionLinks' ) );
		add_filter( 'plugin_row_meta', array( $this, 'rowMeta' ), 10, 2 );
	}

	/** Add the capability-protected settings page. */
	public function addPage(): void {
		add_options_page(
			__( 'Turgenev Settings', 'turgenev' ),
			__( 'Turgenev', 'turgenev' ),
			'manage_options',
			'turgenev-settings',
			array( $this, 'renderPage' )
		);
	}

	/** Register Settings API validation and fields. */
	public function registerSettings(): void {
		register_setting(
			'turgenev-options',
			OptionStore::OPTION_NAME,
			array(
				'type'              => 'array',
				'default'           => array(),
				'sanitize_callback' => array( $this, 'sanitizeSettings' ),
			)
		);

		add_settings_section(
			'turgenev-api',
			__( 'API connection', 'turgenev' ),
			array( $this, 'renderApiSection' ),
			'turgenev-settings'
		);

		add_settings_field(
			'api_key',
			__( 'API key', 'turgenev' ),
			array( $this, 'renderApiKeyField' ),
			'turgenev-settings',
			'turgenev-api'
		);
	}

	/**
	 * Keep the previous key unless a replacement is verified or explicitly removed.
	 *
	 * @param mixed $input Submitted option value.
	 * @return array<string, string>
	 */
	public function sanitizeSettings( $input ): array {
		$current = $this->options->all();
		$input   = is_array( $input ) ? $input : array();

		if ( ! empty( $input['clear_api_key'] ) ) {
			add_settings_error(
				'turgenev-options',
				'turgenev_key_cleared',
				__( 'Turgenev API key removed.', 'turgenev' ),
				'success'
			);
			return array();
		}

		$candidate = isset( $input['api_key'] ) && is_string( $input['api_key'] )
			? trim( sanitize_text_field( wp_unslash( $input['api_key'] ) ) )
			: '';

		// An empty field means “keep the already-saved secret”.
		if ( '' === $candidate ) {
			return $current;
		}

		if ( hash_equals( $this->options->apiKey(), $candidate ) ) {
			return $current;
		}

		try {
			$client  = new ApiClient( $this->options, $candidate );
			$balance = $client->balance();

			add_settings_error(
				'turgenev-options',
				'turgenev_key_saved',
				sprintf(
					/* translators: %s: current API balance. */
					__( 'API key verified and saved. Current balance: %s ₽.', 'turgenev' ),
					esc_html( $balance )
				),
				'success'
			);

			return array( 'api_key' => $candidate );
		} catch ( ApiException $exception ) {
			add_settings_error(
				'turgenev-options',
				'turgenev_key_invalid',
				sprintf(
					/* translators: %s: API validation error. */
					__( 'The new API key was not saved: %s', 'turgenev' ),
					esc_html( $exception->getMessage() )
				),
				'error'
			);

			// Never destroy a previously working key because of a typo or provider outage.
			return $current;
		} catch ( \Throwable $exception ) {
			add_settings_error(
				'turgenev-options',
				'turgenev_key_validation_failed',
				__( 'The new API key could not be verified and was not saved. The previous key was kept.', 'turgenev' ),
				'error'
			);
			return $current;
		}
	}

	/** Render the form through the Settings API nonce/capability boundary. */
	public function renderPage(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap turgenev-settings">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<p><?php esc_html_e( 'Connect WordPress to the official Turgenev content-analysis API. The API key is stored server-side and is never exposed to editor JavaScript.', 'turgenev' ); ?></p>
			<form method="post" action="options.php">
				<?php
				settings_fields( 'turgenev-options' );
				do_settings_sections( 'turgenev-settings' );
				?>
				<p class="submit">
					<?php
					// First in the form, so pressing Enter in the key field saves rather than deletes.
					submit_button( __( 'Save API key', 'turgenev' ), 'primary', 'submit', false );
					?>
					<?php if ( $this->options->hasApiKey() ) : ?>
						<button type="submit" name="turgenev[clear_api_key]" value="1" class="button button-secondary button-link-delete"><?php esc_html_e( 'Delete API Key', 'turgenev' ); ?></button>
					<?php endif; ?>
				</p>
			</form>
		</div>
		<?php
	}

	/** Explain external processing and show a balance refresh control. */
	public function renderApiSection(): void {
		printf(
			'<p>%s</p>',
			wp_kses_post(
				sprintf(
					/* translators: 1: opening link, 2: closing link. */
					__( 'Generate an API key in your %1$sTurgenev account%2$s. Turgenev is an external paid service; a content check is sent only when an editor explicitly starts an analysis.', 'turgenev' ),
					'<a href="https://turgenev.ashmanov.com/?a=apikey" target="_blank" rel="noopener noreferrer">',
					'</a>'
				)
			)
		);

		if ( $this->options->hasApiKey() ) {
			?>
			<div id="turgenev-panel" class="turgenev-status-card" data-turgenev-settings="1">
				<p>
					<strong><?php esc_html_e( 'Current balance:', 'turgenev' ); ?></strong>
					<span id="turgenev-balance" aria-live="polite">…</span>
					<button type="button" class="button button-small" data-turgenev-balance><?php esc_html_e( 'Refresh balance', 'turgenev' ); ?></button>
				</p>
				<div id="turgenev-message" class="turgenev-message" aria-live="polite"></div>
			</div>
			<?php
		}
	}

	/** Render an empty password field; never echo the saved secret. */
	public function renderApiKeyField(): void {
		$has_key = $this->options->hasApiKey();
		?>
		<input
			type="password"
			id="turgenev-api-key"
			name="turgenev[api_key]"
			value=""
			class="regular-text"
			autocomplete="new-password"
			spellcheck="false"
			placeholder="<?php echo $has_key ? esc_attr__( 'Leave blank to keep the saved key', 'turgenev' ) : esc_attr__( 'Paste API key', 'turgenev' ); ?>"
		/>
		<?php if ( $has_key ) : ?>
			<p class="turgenev-saved-key">
				<?php esc_html_e( 'Saved API key:', 'turgenev' ); ?>
				<code><?php echo esc_html( $this->options->maskedApiKey() ); ?></code>
			</p>
		<?php endif; ?>
		<p class="description">
			<?php
			if ( $has_key ) {
				esc_html_e( 'Leave this field empty to keep the currently saved API key.', 'turgenev' );
			} else {
				esc_html_e( 'The key is verified with the balance endpoint before it is stored.', 'turgenev' );
			}
			?>
		</p>
		<?php
	}

	/**
	 * Add a settings shortcut to the plugin row.
	 *
	 * @param array<string, string> $links Plugin action links.
	 * @return array<string, string>
	 */
	public function actionLinks( array $links ): array {
		$settings = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=turgenev-settings' ) ),
			esc_html__( 'Settings', 'turgenev' )
		);

		array_unshift( $links, $settings );
		return $links;
	}

	/**
	 * Link the external service without embedding account credentials.
	 *
	 * @param array<string, string> $links Existing row meta.
	 * @param string                $file Plugin basename.
	 * @return array<string, string>
	 */
	public function rowMeta( array $links, string $file ): array {
		if ( plugin_basename( TURGENEV_FILE ) !== $file ) {
			return $links;
		}

		$links['api_docs'] = '<a href="https://turgenev.ashmanov.com/" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Turgenev service', 'turgenev' ) . '</a>';
		return $links;
	}
}
