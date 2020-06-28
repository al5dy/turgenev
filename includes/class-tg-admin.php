<?php
/**
 * Turgenev Admin
 *
 * @class    TG_Admin
 * @package  Turgenev/Admin
 * @version  1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
  exit; // Exit if accessed directly.
}

/**
 * TG_Admin class.
 */
class TG_Admin {

  private $options = [];

  /**
   * Constructor.
   */
  public function __construct() {
    add_filter( 'plugin_row_meta', [ $this, 'plugin_row_meta' ], 10, 2 );
    add_action( 'admin_menu', [ $this, 'add_plugin_page' ] );
    add_action( 'admin_init', [ $this, 'page_init' ] );

    if (TG()->is_valid_apikey() && !TG()->is_gutenberg_active() ) {
      add_action( 'add_meta_boxes', [ $this, 'add_custom_box' ] );
    }
  }


  function add_custom_box() {
    $screens = [ 'post', 'page' ];
    add_meta_box( 'turgenev_metabox', __('"Turgenev"','turgenev'), [ $this, 'meta_box_cb' ], $screens, 'side', 'high');
  }

  public function meta_box_cb( $post, $meta ) {
    ?>
    <div id="turgenev-panel">
    <p><?php echo esc_html__('Current balance:','turgenev'); ?> <strong id="turgenev-balance">...</strong></p>
    <p>
      <label for="turgenev_raw" class="selectit"><input name="turgenev_raw" checked onchange="TG.contentTypeToggle(event)" type="checkbox" id="turgenev_raw" value="open"> <?php echo esc_html__('Check raw content','turgenev'); ?></label>
      <small><?php echo esc_html__('If the option is enabled, then the content will be checked without HTML tags. Only plain text.','turgenev'); ?></small>
    </p>
      <button type="button" class="button" onclick="TG.checkContent()"><?php echo esc_html__('Check content','turgenev'); ?></button>
      <div id="turgenev-table"></div>
    </div>
    <?php
  }



  /**
   * Add Turgenev settings page
   */
  public function add_plugin_page() {
    add_options_page(
      __( '"Turgenev" Settings', 'turgenev' ),
      __( '"Turgenev"', 'turgenev' ),
      'manage_options',
      'turgenev-settings',
      [ $this, 'create_admin_page' ]
    );
  }

  /**
   * Options page callback
   */
  public function create_admin_page() {
    // Set class property
    $this->options = get_option( 'turgenev' );
    ?>
      <div class="wrap">
          <h1><?php echo get_admin_page_title(); ?></h1>
          <form method="post" action="options.php">
            <?php
            // This prints out all hidden setting fields
            settings_fields( 'turgenev-options' );
            do_settings_sections( 'turgenev-settings' );
            submit_button();
            ?>
          </form>
      </div>
    <?php
  }

  /**
   * Register and add settings
   */
  public function page_init() {
    register_setting(
      'turgenev-options', // Option group
      'turgenev', // Option name
      [ $this, 'sanitize' ] // Sanitize
    );

    add_settings_section(
      'turgenev-section', // ID
      __('API settings','turgenev'), // Title
      [ $this, 'print_section_info' ], // Callback
      'turgenev-settings' // Page
    );

    add_settings_field(
      'api_key',
      __( 'API key', 'turgenev' ),
      [ $this, 'api_key_cb' ],
      'turgenev-settings',
      'turgenev-section'
    );
  }


  /**
   * Sanitize each setting field as needed
   *
   * @param $input
   *
   * @return array
   */
  public function sanitize( $input ) {
    $new_input = [];
    $error = '';


    if ( isset( $input['api_key'] ) ) {
      $new_input['api_key'] = sanitize_text_field( $input['api_key'] );

      $url = 'https://turgenev.ashmanov.com';
      $args = [
        'timeout'     => 45,
        'redirection' => 5,
        'httpversion' => '1.0',
        'blocking'    => true,
        'headers'     => [],
        'body'        => [
          'api' => 'risk',
          'key' => $new_input['api_key'],
          'text' => 'test'
        ],
        'cookies'     =>[]
      ];
      $response = wp_remote_post( $url, $args );
      if ( is_wp_error( $response ) ) {
        add_settings_error( 'turgenev-options', 'turgenev_error', sprintf( __( 'Something went wrong: %s', 'turgenev' ), $response->get_error_message() ), $type = 'error' );
        $error = '1';
      } else {
        $response_json = json_decode( $response['body'], true );
        if ( array_key_exists( 'error', $response_json ) ) {
          add_settings_error( 'turgenev-options', 'turgenev_invalid_api', __( 'Enter a valid API key.', 'turgenev' ), $type = 'error' );
          $error = '1';
        }
      }


    }

    if ( isset( $input['api_key_invalid'] ) ) {
      $new_input['api_key_invalid'] = $error;
    }

    return $new_input;
  }

  /**
   * Print the Section text
   */
  public function print_section_info() {
    printf(
      __( 'First, generate a unique API key in %syour account%s and use it in requests to Turgenev. They will be charged at a reduced price - only 30 kopecks per check - regardless of the availability of a subscription.', 'turgenev' ),
      '<a href="https://turgenev.ashmanov.com/?a=apikey" target="_blank" title="">', '</a>'
    );
  }

  /**
   * Get the settings option array and print one of its values
   */
  public function api_key_cb() {
    printf(
      '<input type="text" id="api_key" name="turgenev[api_key]" value="%s" class="regular-text"><input type="hidden" name="turgenev[api_key_invalid]" value="%s">',
      isset( $this->options['api_key'] ) ? esc_attr( $this->options['api_key'] ) : '',
      isset( $this->options['api_key_invalid'] ) ? esc_attr( $this->options['api_key_invalid'] ) : ''
    );
  }


  /**
   * Show row meta on the plugin screen.
   *
   * @param $links
   * @param $file
   *
   * @return array
   */
  public function plugin_row_meta( $links, $file ) {
    if ( TG_PLUGIN_BASENAME === $file ) {
      $row_meta = [
        'settings' => '<a href="' . admin_url( 'options-general.php?page=turgenev-settings' ) . '" title="' . esc_attr__( 'Go to settings', 'turgenev' ) . '">' . esc_html__( 'Settings', 'turgenev' ) . '</a>',
        'donate'   => '<a href="' . esc_url( 'https://money.yandex.ru/to/410012328678499' ) . '" target="_blank" title="' . esc_attr__( 'Send money to me', 'turgenev' ) . '"><strong style="color:red;">' . esc_html__( 'Donate', 'turgenev' ) . '</strong></a>'
      ];

      return array_merge( $links, $row_meta );
    }

    return (array) $links;
  }

}

return new TG_Admin();
