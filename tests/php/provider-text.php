<?php
/**
 * Provider text localization and the Russian translation files. Included by run.php, whose
 * WordPress stubs (`_x()` returns its msgid; `determine_locale()` reads
 * $GLOBALS['turgenev_test_locale']) and expect_*() helpers it uses.
 */

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Api\ReportSectionParser;
use Al5dy\Turgenev\I18n\ProviderText;
use Al5dy\Turgenev\I18n\ReportGlossary;
use Al5dy\Turgenev\I18n\StyleHintGlossary;

/**
 * Translated entries of a PO file, keyed like an MO file: "context\x04msgid" or "msgid".
 *
 * @return array<string, string>
 */
function turgenev_test_po_entries( string $file ): array {
	$entries = array();
	$entry   = array();
	$field   = null;
	$flush   = static function () use ( &$entry, &$entries ): void {
		// Like msgfmt: the header, untranslated and fuzzy entries never reach the MO file.
		if ( isset( $entry['msgid'], $entry['msgstr'] ) && '' !== $entry['msgid'] && '' !== $entry['msgstr'] && empty( $entry['fuzzy'] ) ) {
			$entries[ ( isset( $entry['msgctxt'] ) ? $entry['msgctxt'] . "\x04" : '' ) . $entry['msgid'] ] = $entry['msgstr'];
		}
		$entry = array();
	};
	foreach ( file( $file, FILE_IGNORE_NEW_LINES ) as $line ) {
		if ( preg_match( '/^(msgctxt|msgid|msgstr) "(.*)"$/', $line, $match ) ) {
			if ( 'msgstr' !== $match[1] && isset( $entry['msgstr'] ) ) {
				$flush();
			}
			$field           = $match[1];
			$entry[ $field ] = stripcslashes( $match[2] );
		} elseif ( null !== $field && preg_match( '/^"(.*)"$/', $line, $match ) ) {
			$entry[ $field ] .= stripcslashes( $match[1] );
		} elseif ( '' === trim( $line ) ) {
			$flush();
			$field = null;
		} elseif ( str_starts_with( $line, '#,' ) && str_contains( $line, 'fuzzy' ) ) {
			$entry['fuzzy'] = true;
		}
	}
	$flush();
	return $entries;
}

/**
 * Entries of a little-endian MO file, keyed the same way.
 *
 * @return array<string, string>
 */
function turgenev_test_mo_entries( string $file ): array {
	$data = (string) file_get_contents( $file );
	$head = unpack( 'Vmagic/Vrevision/Vcount/Voriginals/Vtranslations', $data );
	if ( 0x950412de !== $head['magic'] ) {
		throw new RuntimeException( 'FAIL: ' . $file . ' is not a little-endian MO file.' );
	}
	$entries = array();
	for ( $i = 0; $i < $head['count']; $i++ ) {
		$original                          = unpack( 'Vlength/Voffset', $data, $head['originals'] + $i * 8 );
		$translation                       = unpack( 'Vlength/Voffset', $data, $head['translations'] + $i * 8 );
		$key                               = substr( $data, $original['offset'], $original['length'] );
		$entries[ $key ] = substr( $data, $translation['offset'], $translation['length'] );
	}
	unset( $entries[''] );
	return $entries;
}

$turgenev_locale_before = $GLOBALS['turgenev_test_locale'];
try {
	// --- Which locale sees the provider's own words. ---
	foreach ( array( 'ru_RU' => true, 'ru' => true, 'rue' => false, 'en_US' => false, 'en_GB' => false, 'uk' => false, 'de_DE' => false ) as $locale => $verbatim ) {
		expect_true( $verbatim === ( new ProviderText( $locale ) )->isVerbatim(), "only a Russian locale shows provider text verbatim ($locale)" );
	}
	$follows_request = new ProviderText();
	$GLOBALS['turgenev_test_locale'] = 'en_US';
	expect_true( ! $follows_request->isVerbatim(), 'without a forced locale, the request\'s own locale decides' );
	$GLOBALS['turgenev_test_locale'] = 'ru_RU';
	expect_true( $follows_request->isVerbatim(), 'the locale is read when needed, not frozen at construction (plugins_loaded is too early for the user\'s locale)' );

	$en = new ProviderText( 'en_US' );
	$ru = new ProviderText( 'ru_RU' );
	expect_true( 'high' === $en->text( 'высокий' ) && 'Style errors' === $en->text( 'Стилистические ошибки' ), 'fixed provider vocabulary is translated to English' );
	expect_true( 'высокий' === $ru->text( 'высокий' ) && null === $ru->translation( 'высокий' ), 'a Russian locale gets the provider\'s word untouched, never a round trip through a translation' );
	expect_true( null === $en->translation( 'Совсем новая строка провайдера' ) && 'Совсем новая строка провайдера' === $en->text( 'Совсем новая строка провайдера' ), 'unknown provider text stays as the provider wrote it' );
	expect_true( 'Stop words' === $en->text( "  Стоп-слова\u{00A0}" ), 'lookups share one whitespace convention, NBSP included' );
	$superfreq = 'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью: окна, пластиковые';
	expect_true( 'The number of words that occur in the text significantly more often than a probabilistic model predicts: окна, пластиковые' === $en->text( $superfreq ), 'a provider text embedding the document\'s words translates around them, leaving the words as written' );
	expect_true( $superfreq === $ru->text( $superfreq ), '...and stays verbatim on a Russian locale' );
	expect_true( 'Bureaucratese' === $en->category( '', '#kants' ) && 'Bureaucratese' === $en->category( 'oshibki_kopirajterov', 'kants' ), 'a Style explainer\'s help anchor names its English category' );
	expect_true( 'Style problems' === $en->category( 'vkladki', '#kants' ) && 'Style problems' === $en->category( '', '#unknown' ) && 'Style problems' === $en->category(), 'another article, an unknown anchor or no link at all falls back to the general style section' );
	expect_true( null === $ru->category( '', '#kants' ) && null === $ru->category(), 'a Russian locale never gets a category added' );

	// --- Glossary integrity: what the ru_RU translation and every lookup rely on. ---
	$report = ReportGlossary::entries();
	$style  = StyleHintGlossary::entries();
	expect_true( array() === array_intersect_key( $report, $style ), 'no provider text is claimed by both glossaries' );
	$glossary = $report + $style;
	expect_true( count( $glossary ) === count( array_unique( array_map( array( ProviderText::class, 'normalize' ), array_keys( $glossary ) ) ) ), 'no two provider texts collapse into one lookup key' );
	expect_true( count( $glossary ) === count( array_unique( $glossary ) ), 'every English text translates exactly one provider text, so its Russian translation is unambiguous' );
	$italic = '/\b_([^_]+)_\b/';
	foreach ( $glossary as $russian => $english ) {
		$prose = (string) preg_replace( array( '/«[^»]*»/u', '/“[^”]*”/u', $italic ), '', $english );
		expect_true( '' !== trim( $english ) && ! preg_match( '/\p{Cyrillic}/u', $prose ), 'English outside quoted Russian examples: ' . $english );
		foreach ( preg_split( $italic, $english, -1, PREG_SPLIT_DELIM_CAPTURE ) as $index => $part ) {
			expect_true( 1 === $index % 2 || ! str_contains( $part, '_' ), 'every italic marker is paired: ' . $english );
		}
		expect_true( ( 1 <= preg_match_all( $italic, $russian ) ) === ( 1 <= preg_match_all( $italic, $english ) ), 'an explainer keeps its emphasis in English: ' . $english );
	}
	$categories = ReportGlossary::categories();
	expect_true( count( $categories ) === count( array_unique( array_column( $categories, 1 ) ) ), 'category titles are distinct' );
	foreach ( $categories as [ $russian, $english ] ) {
		expect_true( ( $report[ $russian ] ?? null ) === $english, 'a category title translates the same as a "See also" label: ' . $russian );
	}

	// --- PHP loads the translation the plugin ships, ahead of any language pack. ---
	$bundled = new Al5dy\Turgenev\I18n\BundledTranslations();
	$bundled->register();
	expect_true( in_array( array( $bundled, 'directory' ), $GLOBALS['turgenev_test_filters']['lang_dir_for_domain'] ?? array(), true ), 'the languages directory lookup is filtered' );
	$pack = '/wp-content/languages/plugins/';
	expect_true( TURGENEV_DIR . 'languages/' === $bundled->directory( $pack, 'turgenev', 'ru_RU' ), 'a shipped locale is read from the plugin, not an older language pack' );
	expect_true( TURGENEV_DIR . 'languages/' === $bundled->directory( false, 'turgenev', 'ru_RU' ), '...also where no language pack exists at all' );
	expect_true( $pack === $bundled->directory( $pack, 'turgenev', 'de_DE' ) && false === $bundled->directory( false, 'turgenev', 'de_DE' ), 'a locale the plugin does not ship keeps whatever WordPress found' );
	expect_true( $pack === $bundled->directory( $pack, 'other-plugin', 'ru_RU' ) && $pack === $bundled->directory( $pack, 'turgenev', '../ru_RU' ), 'other domains and malformed locales are left alone' );

	// --- The committed Russian translation restores every provider original exactly. ---
	$po = turgenev_test_po_entries( TURGENEV_DIR . 'languages/turgenev-ru_RU.po' );
	$mo = turgenev_test_mo_entries( TURGENEV_DIR . 'languages/turgenev-ru_RU.mo' );
	$pairs = $glossary;
	foreach ( ReportGlossary::patterns() as [ $provider, $format ] ) {
		$pairs[ $provider ] = $format;
	}
	foreach ( $pairs as $russian => $english ) {
		$key = "Turgenev report\x04" . $english;
		expect_true( ( $po[ $key ] ?? null ) === $russian, 'the ru_RU PO translates a report msgid back to the provider\'s exact text: ' . $english );
	}
	ksort( $po );
	ksort( $mo );
	expect_true( $po === $mo, 'the compiled ru_RU MO matches its PO exactly (rebuild it after every PO change)' );

	// --- Parsed report sections, in English and verbatim. ---
	if ( Al5dy\Turgenev\Support\Requirements::hasDom() ) {
		$explainer_known   = '_Всегда старайтесь_ обойтись без слова «всегда», если это возможно. Без него _всегда получается_ достовернее, а часто и убедительнее.';
		$explainer_unknown = 'Совсем новое пояснение, которого нет в словаре.';
		$report_page       = static fn( string $infoblock, string $xhints = '{}' ): string => '<html><body><script>var XHints = ' . $xhints . ';</script><div id="infoblock">' . $infoblock . '</div></body></html>';
		$row               = static fn( string $name, string $value, string $hint = '', string $class = '' ): string => "<tr class='$class'><td class='xphintblock'><span class='xpname'>$name</span>"
			. ( '' === $hint ? '' : "<div class='xphint'>$hint<br><a href='/?h=vkladki#academ' target='bbhelp'>Подробнее</a><span class='cloud'></span></div>" )
			. "</td><td><span class='mark'>2</span></td><td align='right'><span class='value'>$value</span></td></tr>";
		$overall_page      = $report_page(
			"<table class='xprops'>"
			. $row( '«Академическая тошнота»', '9.45', 'Параметр, оценивающий количество повторов слов в тексте. Чем чаще слово повторяется, тем больше его вклад.' )
			. $row( 'Сверхчастые слова', 'Нет', 'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью:<br><i>окна</i>, <i>пластиковые</i>' )
			. $row( 'Водность', '12.3', '', 'low' )
			. $row( 'Будущая характеристика', '1' )
			. "</table><div id='legend'><table><tr><td><em class='xhl bb2'>&nbsp;</em></td><td>Много проблем. Желательно отредактировать или переписать.</td></tr></table></div>",
			'{"0-5":[{"t":"","c":"<a href=\'#slop_words\'>Стилистические ошибки</a>,<br><a href=\'#fre\'>Длинное предложение</a>,<br><a href=\'#new\'>Новая проблема</a>"}]}'
		);
		$style_page        = $report_page(
			"<table class='xprops'>" . $row( 'Количество стилистических проблем', '13', 'Сумма «квантов» (от 1 до 3), полученных словами текста за стилистические проблемы.' ) . '</table>',
			json_encode(
				array(
					'3-2' => array(
						array(
							't' => 'всегда старайтесь',
							'c' => array( $explainer_known . ' &#sh', $explainer_unknown . ' &#kants[Канцелярит] &#kants', 'Избегайте лишних восклицаний!!!! &oshibki_kopirajterov#emo', 'Ещё одно неизвестное пояснение, без ссылки.' ),
						),
					),
				),
				JSON_UNESCAPED_UNICODE
			)
		);
		$keywords_page     = $report_page( "<table class='xprops'><tr><td><span class='xpname'>• покрытие запросами</span></td><td align='right'><span class='value'>0.34</span></td></tr></table>" );
		$frequency_page    = $report_page( "<div id='words_frq_stat'><table><tr class='xhl doubles4 stm-6-190E7' title='Стоп-слово'><td>окна</td><td><span class='mark'>2</span></td><td><span class='value'>7</span></td><td><span class='value'>5.2%</span></td></tr></table></div>" );

		$en_parser = new ReportSectionParser( null, $en );
		$ru_parser = new ReportSectionParser( null, $ru );
		$overall   = $en_parser->parse( $overall_page, 'overall' );
		expect_true( array( '“Academic nausea”', 'Overly frequent words', 'Water content', 'Будущая характеристика' ) === array_column( $overall['params'], 'name' ), 'characteristic names are translated; an unknown one stays as the provider wrote it' );
		expect_true( 'No' === $overall['params'][1]['value'] && '9.45' === $overall['params'][0]['value'], 'a textual value is translated, a number is left alone' );
		expect_true( 'A parameter that rates how much words repeat in the text. The more often a word repeats, the more it contributes.' === $overall['params'][0]['hint'], 'a characteristic\'s explainer is translated' );
		expect_true( 'The number of words that occur in the text significantly more often than a probabilistic model predicts: окна, пластиковые' === $overall['params'][1]['hint'], 'the document\'s own words inside an explainer stay untranslated' );
		expect_true( 'The share of stop words in the text. Not used to determine the risk.' === $overall['params'][2]['hint'] && 'https://turgenev.ashmanov.com/?h=vkladki#water' === $overall['params'][2]['hintUrl'], 'a row without its own explainer gets the provider\'s one from the server, translated like any other' );
		expect_true( ! isset( $overall['params'][3]['hint'] ), 'an unknown characteristic without an explainer gets none' );
		expect_true( 'Many problems. Editing or rewriting is advisable.' === $overall['legend'][0]['label'], 'legend labels are translated' );
		expect_true(
			array(
				array( 'label' => 'Style errors', 'section' => 'style' ),
				array( 'label' => 'Long sentence', 'section' => 'readability' ),
				array( 'label' => 'Новая проблема' ),
			) === $overall['sentenceProblems']['0-5'],
			'sentence problems are translated and keep their section links'
		);

		$overall_ru = $ru_parser->parse( $overall_page, 'overall' );
		expect_true( array( '«Академическая тошнота»', 'Сверхчастые слова', 'Водность', 'Будущая характеристика' ) === array_column( $overall_ru['params'], 'name' ) && 'Нет' === $overall_ru['params'][1]['value'], 'a Russian locale gets every characteristic exactly as the provider sent it' );
		expect_true( 'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью: окна, пластиковые' === $overall_ru['params'][1]['hint'] && 'Доля стоп-слов в тексте. Для определения риска не используется.' === $overall_ru['params'][2]['hint'], '...and every explainer, the server\'s own fallback included' );
		expect_true( 'Много проблем. Желательно отредактировать или переписать.' === $overall_ru['legend'][0]['label'] && 'Стилистические ошибки' === $overall_ru['sentenceProblems']['0-5'][0]['label'], '...legends and sentence problems too' );

		$hints = $en_parser->parse( $style_page, 'style' )['hints']['3-2'];
		expect_true( 'всегда старайтесь' === $hints[0]['title'] && 'всегда старайтесь' === $hints[1]['title'], 'a hint\'s title is the document\'s own words and is never translated' );
		expect_true(
			array(
				array(
					'text'   => 'Always try',
					'italic' => true,
				),
				array( 'text' => ' to do without the word «всегда» (“always”) when you can. Without it the text ' ),
				array(
					'text'   => 'always comes out',
					'italic' => true,
				),
				array( 'text' => ' more credible, and often more convincing.' ),
			) === $hints[0]['text'] && ! isset( $hints[0]['category'] ),
			'a known explainer is translated as a whole and keeps its italics'
		);
		expect_true( array( array( 'text' => $explainer_unknown ) ) === $hints[1]['text'] && 'Bureaucratese' === $hints[1]['category'], 'an unknown explainer stays in Russian under its English category' );
		expect_true( array( array( 'label' => 'Bureaucratese', 'url' => 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#kants' ) ) === $hints[1]['seeAlso'], '"See also" labels are translated' );
		expect_true( 'Avoid unnecessary exclamations!!!!' === $hints[2]['text'][0]['text'] && 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#emo' === $hints[2]['more'], 'a translated explainer keeps its help link' );
		expect_true( 'Style problems' === $hints[3]['category'] && ! isset( $hints[3]['more'] ) && 'Ещё одно неизвестное пояснение, без ссылки.' === $hints[3]['text'][0]['text'], 'an unknown explainer without a help link still gets an English heading' );
		expect_true( 'The sum of the “quanta” (from 1 to 3) the words of the text received for style problems.' === $en_parser->parse( $style_page, 'style' )['params'][0]['hint'], 'every section\'s characteristic explainers are translated, not only overall' );

		$hints_ru = $ru_parser->parse( $style_page, 'style' )['hints']['3-2'];
		expect_true( 'Всегда старайтесь' === $hints_ru[0]['text'][0]['text'] && $explainer_unknown === $hints_ru[1]['text'][0]['text'] && ! isset( $hints_ru[1]['category'] ) && ! isset( $hints_ru[3]['category'] ) && 'Канцелярит' === $hints_ru[1]['seeAlso'][0]['label'], 'a Russian locale gets explainers verbatim, without any added category' );

		expect_true( array( array( 'label' => 'keyword coverage', 'value' => '0.34' ) ) === $en_parser->parse( $keywords_page, 'keywords' )['breakdown'], 'keyword breakdown labels are translated' );
		expect_true( 'покрытие запросами' === $ru_parser->parse( $keywords_page, 'keywords' )['breakdown'][0]['label'], '...and verbatim on a Russian locale' );
		$words = $en_parser->parse( $frequency_page, 'frequency' )['words'][0];
		expect_true( 'окна' === $words['text'] && true === $words['stopword'], 'frequency tables list the document\'s own words, untranslated, and still read the provider\'s Russian stop-word marker' );

		// Through the real AJAX path the request's locale decides.
		$GLOBALS['turgenev_test_locale'] = 'en_US';
		respond_html( $overall_page );
		$via_client = ( new ApiClient( new Al5dy\Turgenev\Support\OptionStore() ) )->reportSectionDetails( 'abc12345', 'overall' );
		expect_true( 'Water content' === $via_client['params'][2]['name'], 'section details follow the request\'s locale' );
		$GLOBALS['turgenev_test_locale'] = 'ru_RU';
	}

	// --- The risk verdict: the provider's word for logic, a label for display. ---
	$GLOBALS['turgenev_test_options']['turgenev'] = array( 'api_key' => 'working-key' );
	$controller                                    = new Al5dy\Turgenev\Ajax\ApiController( new ApiClient( new Al5dy\Turgenev\Support\OptionStore() ), new Al5dy\Turgenev\Support\RateLimiter() );
	foreach ( array( 'en_US' => 'high', 'ru_RU' => 'высокий' ) as $locale => $label ) {
		$GLOBALS['turgenev_test_locale'] = $locale;
		$_POST                           = array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' );
		$GLOBALS['test_caps']            = array( array( 'edit_post', 42 ) );
		$GLOBALS['turgenev_test_transients'] = array();
		respond( array( 'level' => 'высокий' ) + fixture_analysis() );
		try {
			$controller->handle();
			throw new RuntimeException( 'Controller did not return JSON.' );
		} catch ( JsonExit $response ) {
			expect_true( 200 === $response->status && 'высокий' === $response->data['result']['level'] && $label === $response->data['result']['levelLabel'], "the verdict keeps the provider's word and adds its label ($locale)" );
		}
	}
} finally {
	$GLOBALS['turgenev_test_locale'] = $turgenev_locale_before;
}
