<?php
/**
 * Turgenev API exception.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

defined( 'ABSPATH' ) || exit;

/** Safe integration error, caught and escaped at admin boundaries. */
final class ApiException extends \RuntimeException {}
