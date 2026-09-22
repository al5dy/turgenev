<?php
/**
 * Editor integration and assets.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Admin;

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Support\OptionStore;
use Al5dy\Turgenev\Support\Requirements;

defined( 'ABSPATH' ) || exit;

/** Registers editor UI independently of API configuration or selected block. */
final class EditorIntegration {
	/**
	 * Configuration presence for initial UI state.
	 *
	 * @var OptionStore
	 */
	private OptionStore $options;

	/**
	 * Whether this environment can render highlight previews.
	 *
	 * @var bool
	 */
	private bool $has_dom;

	/**
	 * Bind server-side configuration access.
	 *
	 * @param OptionStore $options Configuration store.
	 * @param bool|null   $has_dom Forced highlight capability; null resolves `Requirements::hasDom()`.
	 */
	public function __construct( OptionStore $options, ?bool $has_dom = null ) {
		$this->options = $options;
		$this->has_dom = $has_dom ?? Requirements::hasDom();
	}

	/** Register scoped admin/editor hooks. */
	public function register(): void {
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueueBlockEditorAssets' ) );
		add_action( 'enqueue_block_assets', array( $this, 'enqueueCanvasStyles' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueueAdminAssets' ) );
		add_action( 'add_meta_boxes', array( $this, 'addMetaBoxes' ) );
	}

	/**
	 * Load the Gutenberg integration on every supported block-editor screen.
	 *
	 * The UI must never disappear merely because an API key is missing. A missing
	 * key is a configuration state, not a reason to unregister the editor UI.
	 */
	public function enqueueBlockEditorAssets(): void {
		$this->enqueueClient();
		wp_enqueue_script(
			'turgenev-editor-content',
			TURGENEV_URL . 'assets/build/editor-content.js',
			array( 'turgenev-analysis', 'turgenev-highlights', 'turgenev-content-reset', 'wp-blocks', 'wp-data', 'wp-editor' ),
			$this->assetVersion( 'assets/build/editor-content.js' ),
			true
		);
		wp_set_script_translations( 'turgenev-editor-content', 'turgenev', TURGENEV_DIR . 'languages' );
		wp_enqueue_script(
			'turgenev-editor',
			TURGENEV_URL . 'assets/build/editor.js',
			array( 'turgenev-editor-content', 'wp-plugins', 'wp-data', 'wp-element', 'wp-i18n', 'wp-notices' ),
			$this->assetVersion( 'assets/build/editor.js' ),
			true
		);
		wp_set_script_translations( 'turgenev-editor', 'turgenev', TURGENEV_DIR . 'languages' );
		wp_enqueue_style( 'turgenev-admin' );
	}

	/**
	 * Load highlight colors inside Gutenberg's iframe as well as the admin page.
	 */
	public function enqueueCanvasStyles(): void {
		if ( is_admin() ) {
			wp_enqueue_style(
				'turgenev-canvas',
				TURGENEV_URL . 'assets/build/admin.css',
				array(),
				$this->assetVersion( 'assets/build/admin.css' )
			);
		}
	}

	/**
	 * Load settings / Classic Editor assets.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueueAdminAssets( string $hook_suffix ): void {
		$screen      = get_current_screen();
		$is_settings = 'settings_page_turgenev-settings' === $hook_suffix;

		if ( $is_settings ) {
			$this->enqueueClient();
			$this->enqueueClassicScript();
			wp_enqueue_style( 'turgenev-admin' );
			return;
		}

		if ( ! in_array( $hook_suffix, array( 'post.php', 'post-new.php' ), true ) || ! $screen || ! $screen->post_type || ! post_type_supports( $screen->post_type, 'editor' ) ) {
			return;
		}

		// Gutenberg has its own integration loaded through enqueue_block_editor_assets.
		if ( method_exists( $screen, 'is_block_editor' ) && $screen->is_block_editor() ) {
			return;
		}

		$this->enqueueClient();
		$this->enqueueClassicScript();
		wp_enqueue_style( 'turgenev-admin' );
	}

	/**
	 * Register the Classic Editor metabox.
	 *
	 * Do not infer the active editor from the post type alone. Classic Editor can switch
	 * individual edit screens to the classic UI while the post type itself still
	 * reports block-editor support. The current WP_Screen is authoritative.
	 */
	public function addMetaBoxes(): void {
		$screen = get_current_screen();
		if ( $screen && method_exists( $screen, 'is_block_editor' ) && $screen->is_block_editor() ) {
			return;
		}

		$post_types = get_post_types( array( 'show_ui' => true ), 'names' );
		foreach ( $post_types as $post_type ) {
			if ( ! post_type_supports( $post_type, 'editor' ) ) {
				continue;
			}

			add_meta_box(
				'turgenev_metabox',
				__( 'Turgenev', 'turgenev' ),
				array( $this, 'renderMetaBox' ),
				$post_type,
				'side',
				'high'
			);
		}
	}

	/** Render an accessible no-key state before the shared client mounts. */
	public function renderMetaBox(): void {
		?>
		<div id="turgenev-panel" class="turgenev-panel">
			<?php if ( ! $this->options->hasApiKey() ) : ?>
				<div class="turgenev-setup-notice">
					<p><?php esc_html_e( 'Turgenev is ready, but an API key has not been configured yet.', 'turgenev' ); ?></p>
					<p>
						<a class="button button-primary" href="<?php echo esc_url( admin_url( 'options-general.php?page=turgenev-settings' ) ); ?>">
							<?php esc_html_e( 'Configure API key', 'turgenev' ); ?>
						</a>
					</p>
				</div>
			<?php endif; ?>
			<p>
				<?php esc_html_e( 'Current balance:', 'turgenev' ); ?>
				<strong id="turgenev-balance" aria-live="polite"><?php echo $this->options->hasApiKey() ? '…' : '—'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></strong>
			</p>
			<div id="turgenev-workflow">
				<p>
					<label>
						<input type="checkbox" id="turgenev-raw" checked />
						<?php esc_html_e( 'Analyze plain text only', 'turgenev' ); ?>
					</label>
					<span class="description"><?php esc_html_e( 'When enabled, HTML markup is removed before the text is sent for analysis.', 'turgenev' ); ?></span>
				</p>
				<p><button type="button" class="button button-primary" data-turgenev-check <?php disabled( ! $this->options->hasApiKey() ); ?>><?php esc_html_e( 'Analyze content', 'turgenev' ); ?></button></p>
				<div id="turgenev-message" class="turgenev-message" aria-live="polite"></div>
				<div id="turgenev-table"></div>
			</div>
			<p><a href="https://turgenev.ashmanov.com/?a=pay" class="button" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Top up Turgenev balance', 'turgenev' ); ?></a></p>
		</div>
		<?php
	}

	/** Register shared assets and non-secret configuration. */
	private function enqueueClient(): void {
		if ( wp_script_is( 'turgenev-client', 'registered' ) ) {
			wp_enqueue_script( 'turgenev-client' );
			return;
		}

		wp_register_style(
			'turgenev-admin',
			TURGENEV_URL . 'assets/build/admin.css',
			array( 'dashicons' ),
			$this->assetVersion( 'assets/build/admin.css' )
		);

		wp_register_script(
			'turgenev-client',
			TURGENEV_URL . 'assets/build/client.js',
			array( 'wp-i18n' ),
			$this->assetVersion( 'assets/build/client.js' ),
			true
		);

		wp_localize_script(
			'turgenev-client',
			'TurgenevConfig',
			array(
				'ajaxUrl'             => admin_url( 'admin-ajax.php' ),
				'nonce'               => wp_create_nonce( 'turgenev_api' ),
				'reportBaseUrl'       => ApiClient::REPORT_BASE_URL,
				'maxTextLength'       => ApiClient::MAX_TEXT_LENGTH,
				'isConfigured'        => $this->options->hasApiKey(),
				'settingsUrl'         => admin_url( 'options-general.php?page=turgenev-settings' ),
				'topUpUrl'            => 'https://turgenev.ashmanov.com/?a=pay',
				'postId'              => (int) get_the_ID(),
				'highlightsAvailable' => $this->has_dom,
			)
		);

		wp_enqueue_script( 'turgenev-client' );
		wp_set_script_translations( 'turgenev-client', 'turgenev', TURGENEV_DIR . 'languages' );
		foreach ( array( 'highlights', 'analysis', 'content-reset' ) as $module ) {
			wp_enqueue_script( 'turgenev-' . $module, TURGENEV_URL . 'assets/build/' . $module . '.js', array( 'turgenev-client' ), $this->assetVersion( 'assets/build/' . $module . '.js' ), true );
			wp_set_script_translations( 'turgenev-' . $module, 'turgenev', TURGENEV_DIR . 'languages' );
		}
	}

	/** Enqueue the full-document Classic Editor adapter. */
	private function enqueueClassicScript(): void {
		wp_enqueue_script(
			'turgenev-classic',
			TURGENEV_URL . 'assets/build/classic.js',
			array( 'turgenev-analysis', 'turgenev-highlights', 'turgenev-content-reset', 'wp-i18n' ),
			$this->assetVersion( 'assets/build/classic.js' ),
			true
		);
		wp_set_script_translations( 'turgenev-classic', 'turgenev', TURGENEV_DIR . 'languages' );
	}

	/**
	 * Bust development caches without changing the release version.
	 *
	 * @param string $relative_path Runtime asset path.
	 * @return string
	 */
	private function assetVersion( string $relative_path ): string {
		$modified_at = filemtime( TURGENEV_DIR . $relative_path );

		return false === $modified_at ? TURGENEV_VERSION : (string) $modified_at;
	}
}
