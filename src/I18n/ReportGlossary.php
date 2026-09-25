<?php
/**
 * English for the provider's fixed report vocabulary.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\I18n;

defined( 'ABSPATH' ) || exit;

/**
 * Every fixed Russian text a Turgenev response or report page carries, keyed exactly as
 * the provider writes it (confirmed live), with its English msgid.
 *
 * All msgids share the `Turgenev report` context: the Russian translation of each one is
 * the provider's own original, which keeps them apart from the plugin's interface strings
 * (e.g. "Keywords" the report label vs. "Keywords" the section name).
 */
final class ReportGlossary {
	/**
	 * Provider text => English.
	 *
	 * @return array<string, string>
	 */
	public static function entries(): array {
		$entries = array(
			// Risk verdicts (`level` of the `risk` operation).
			'минимальный'                                 => _x( 'minimal', 'Turgenev report', 'turgenev' ),
			'низкий'                                      => _x( 'low', 'Turgenev report', 'turgenev' ),
			'средний'                                     => _x( 'medium', 'Turgenev report', 'turgenev' ),
			'высокий'                                     => _x( 'high', 'Turgenev report', 'turgenev' ),
			'критический'                                 => _x( 'critical', 'Turgenev report', 'turgenev' ),

			// Characteristic names.
			'«Академическая тошнота»'                     => _x( '“Academic nausea”', 'Turgenev report', 'turgenev' ),
			'«Классическая тошнота»'                      => _x( '“Classic nausea”', 'Turgenev report', 'turgenev' ),
			'«Тошнота» словосочетаний'                    => _x( 'Phrase “nausea”', 'Turgenev report', 'turgenev' ),
			'Водность'                                    => _x( 'Water content', 'Turgenev report', 'turgenev' ),
			'Доля содержательного текста'                 => _x( 'Share of meaningful text', 'Turgenev report', 'turgenev' ),
			'Индекс удобочитаемости'                      => _x( 'Readability index', 'Turgenev report', 'turgenev' ),
			'Количество стилистических проблем'           => _x( 'Number of style problems', 'Turgenev report', 'turgenev' ),
			'Плотность стилистических проблем'            => _x( 'Style problem density', 'Turgenev report', 'turgenev' ),
			'Покрытие ключевыми словами'                  => _x( 'Keyword coverage', 'Turgenev report', 'turgenev' ),
			'Сверхконцентрация «и»'                       => _x( 'Overuse of “и” (“and”)', 'Turgenev report', 'turgenev' ),
			'Сверхчастые слова'                           => _x( 'Overly frequent words', 'Turgenev report', 'turgenev' ),

			// Characteristic explainers.
			'"Академическая тошнота", посчитанная не для отдельных слов, а для пар слов (между которыми может быть предлог). Она тем выше, чем больше повторов словосочетаний.' => _x( '“Academic nausea” calculated for pairs of words (possibly with a preposition between them) rather than for single words. The more phrases repeat, the higher it is.', 'Turgenev report', 'turgenev' ),
			'Доля в тексте слов, не входящих в списки стоп-слов и общих слов.' => _x( 'The share of words in the text that are on neither the stop-word nor the common-word list.', 'Turgenev report', 'turgenev' ),
			'Доля стоп-слов в тексте. Для определения риска не используется.' => _x( 'The share of stop words in the text. Not used to determine the risk.', 'Turgenev report', 'turgenev' ),
			'Доля текста, которую занимают запросы (с учетом «штрафов» за запросы в точной форме и длинные запросы).' => _x( 'The share of the text taken up by search queries (including “penalties” for exact-match and long queries).', 'Turgenev report', 'turgenev' ),
			'Индекс, оценивающий сложность текста на основе средних длин слов и предложений. Automated Readability Index в варианте, адаптированном для русского языка.' => _x( 'An index that rates how hard a text is to read from its average word and sentence lengths: the Automated Readability Index, adapted for Russian.', 'Turgenev report', 'turgenev' ),
			'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью.' => _x( 'The number of words that occur in the text significantly more often than a probabilistic model predicts.', 'Turgenev report', 'turgenev' ),
			'Количество стилистических проблем, деленное на длину текста в словах.' => _x( 'The number of style problems divided by the length of the text in words.', 'Turgenev report', 'turgenev' ),
			'Параметр, зависящий от максимальной частоты слов в тексте. Для определения риска не используется.' => _x( 'A parameter that depends on the highest word frequency in the text. Not used to determine the risk.', 'Turgenev report', 'turgenev' ),
			'Параметр, оценивающий количество повторов слов в тексте. Чем чаще слово повторяется, тем больше его вклад.' => _x( 'A parameter that rates how much words repeat in the text. The more often a word repeats, the more it contributes.', 'Turgenev report', 'turgenev' ),
			'Слишком большое количество повторов союза «и». Может свидетельствовать о злоупотреблении конструкциями типа «удобно и выгодно».' => _x( 'Too many repetitions of the conjunction “и” (“and”). May point to overuse of constructions like «удобно и выгодно» (“convenient and profitable”).', 'Turgenev report', 'turgenev' ),
			'Сумма «квантов» (от 1 до 3), полученных словами текста за стилистические проблемы.' => _x( 'The sum of the “quanta” (from 1 to 3) the words of the text received for style problems.', 'Turgenev report', 'turgenev' ),

			// Characteristic values.
			'Нет'                                         => _x( 'No', 'Turgenev report', 'turgenev' ),

			// Legends.
			'Есть проблемы. Желательно отредактировать.'  => _x( 'There are problems. Editing is advisable.', 'Turgenev report', 'turgenev' ),
			'Много проблем. Желательно отредактировать или переписать.' => _x( 'Many problems. Editing or rewriting is advisable.', 'Turgenev report', 'turgenev' ),
			'Очень много проблем. Желательно переписать.' => _x( 'Very many problems. Rewriting is advisable.', 'Turgenev report', 'turgenev' ),
			'Потенциальные стилистические проблемы — возможно, всё ОК.' => _x( 'Potential style problems — it may well be fine.', 'Turgenev report', 'turgenev' ),
			'Проблема почти точно есть. Желательно отредактировать.' => _x( 'Almost certainly a problem. Editing is advisable.', 'Turgenev report', 'turgenev' ),
			'Серьезная проблема. Исправьте.'              => _x( 'A serious problem. Fix it.', 'Turgenev report', 'turgenev' ),
			'Общие ("пустые") слова'                      => _x( 'Common (“empty”) words', 'Turgenev report', 'turgenev' ),
			'Стоп-слова'                                  => _x( 'Stop words', 'Turgenev report', 'turgenev' ),
			'Запросы'                                     => _x( 'Keywords', 'Turgenev report', 'turgenev' ),
			'Запросы в точной форме'                      => _x( 'Exact-match keywords', 'Turgenev report', 'turgenev' ),
			'Длинные предложения'                         => _x( 'Long sentences', 'Turgenev report', 'turgenev' ),
			'Длинные слова'                               => _x( 'Long words', 'Turgenev report', 'turgenev' ),

			// "Problems in this sentence" ("Запросы" is listed with the legends above).
			'Длинное предложение'                         => _x( 'Long sentence', 'Turgenev report', 'turgenev' ),
			'Наличие длинных слов'                        => _x( 'Contains long words', 'Turgenev report', 'turgenev' ),
			'Наличие слов, часто встречающихся в тексте'  => _x( 'Contains words that occur frequently in the text', 'Turgenev report', 'turgenev' ),
			'Низкая доля содержательного текста'          => _x( 'Low share of meaningful text', 'Turgenev report', 'turgenev' ),
			'Стилистические ошибки'                       => _x( 'Style errors', 'Turgenev report', 'turgenev' ),

			// "Keywords" coverage breakdown.
			'покрытие запросами'                          => _x( 'keyword coverage', 'Turgenev report', 'turgenev' ),
			'покрытие точными запросами'                  => _x( 'exact-match keyword coverage', 'Turgenev report', 'turgenev' ),
			'длинные запросы'                             => _x( 'long keywords', 'Turgenev report', 'turgenev' ),
		);

		// Help-wiki section titles double as the Style explainers' "See also" labels.
		foreach ( self::categories() as [ $russian, $english ] ) {
			$entries[ $russian ] = $english;
		}

		return $entries;
	}

	/**
	 * Provider texts that embed words from the analyzed document, which stay untranslated.
	 *
	 * @return list<array{0: string, 1: string}> Provider text with `%s` where the document's words go => English sprintf() format.
	 */
	public static function patterns(): array {
		return array(
			array(
				'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью: %s',
				/* translators: %s: comma-separated words from the analyzed text, left in their original language. */
				_x( 'The number of words that occur in the text significantly more often than a probabilistic model predicts: %s', 'Turgenev report', 'turgenev' ),
			),
		);
	}

	/**
	 * Sections of the provider's "Типичные ошибки копирайтеров" help article, which every
	 * Style explainer links to by anchor.
	 *
	 * @return array<string, array{0: string, 1: string}> Anchor => [provider title, English title].
	 */
	public static function categories(): array {
		return array(
			'keys'     => array( 'Ключевики', _x( 'Keyword stuffing', 'Turgenev report', 'turgenev' ) ),
			'sh'       => array( 'Шаблонный текст', _x( 'Boilerplate text', 'Turgenev report', 'turgenev' ) ),
			'empty'    => array( 'Вода, вода...', _x( 'Filler, filler...', 'Turgenev report', 'turgenev' ) ),
			'klass'    => array( 'Классификация и особенности', _x( 'Classifications and features', 'Turgenev report', 'turgenev' ) ),
			'lists'    => array( 'Перечисления', _x( 'Enumerations', 'Turgenev report', 'turgenev' ) ),
			'indef'    => array( 'Общие слова', _x( 'Vague words', 'Turgenev report', 'turgenev' ) ),
			'meta'     => array( 'Рассказ о рассказе', _x( 'Writing about the writing', 'Turgenev report', 'turgenev' ) ),
			'ton'      => array( 'Неправильный тон разговора с клиентом', _x( 'The wrong tone with the customer', 'Turgenev report', 'turgenev' ) ),
			'boast'    => array( 'Сам себя не похвалишь...', _x( 'Blowing your own trumpet...', 'Turgenev report', 'turgenev' ) ),
			'market'   => array( 'Marketing Bullshit', _x( 'Marketing Bullshit', 'Turgenev report', 'turgenev' ) ),
			'didact'   => array( 'Поучения', _x( 'Lecturing', 'Turgenev report', 'turgenev' ) ),
			'ascribe'  => array( 'Манипуляция', _x( 'Manipulation', 'Turgenev report', 'turgenev' ) ),
			'persp'    => array( 'Рассказ с точки зрения продавца', _x( 'The seller’s point of view', 'Turgenev report', 'turgenev' ) ),
			'cheap'    => array( 'Бестактность при разговоре о ценах', _x( 'Tactless talk about prices', 'Turgenev report', 'turgenev' ) ),
			'nom'      => array( 'Косвенные наименования', _x( 'Indirect names', 'Turgenev report', 'turgenev' ) ),
			'style'    => array( 'Стилистические проблемы', _x( 'Style problems', 'Turgenev report', 'turgenev' ) ),
			'kants'    => array( 'Канцелярит', _x( 'Bureaucratese', 'Turgenev report', 'turgenev' ) ),
			'boring'   => array( '«Занудный стиль»', _x( '“Tedious style”', 'Turgenev report', 'turgenev' ) ),
			'heavy'    => array( '«Утяжеление» текста', _x( '“Weighing down” the text', 'Turgenev report', 'turgenev' ) ),
			'emo'      => array( 'Неоправданная эмоциональность', _x( 'Unjustified emotion', 'Turgenev report', 'turgenev' ) ),
			'colloq'   => array( 'Разговорный стиль, варваризмы, жаргонизмы', _x( 'Colloquialisms, foreign borrowings and slang', 'Turgenev report', 'turgenev' ) ),
			'small'    => array( 'Сюсюканье', _x( 'Baby talk', 'Turgenev report', 'turgenev' ) ),
			'pathetic' => array( 'Пафос', _x( 'Pomposity', 'Turgenev report', 'turgenev' ) ),
			'figures'  => array( 'Красивости и образность', _x( 'Flourishes and imagery', 'Turgenev report', 'turgenev' ) ),
			'repeat'   => array( 'Повторы и тавтологии', _x( 'Repetition and tautology', 'Turgenev report', 'turgenev' ) ),
			'general'  => array( 'Обобщения', _x( 'Generalizations', 'Turgenev report', 'turgenev' ) ),
			'limit'    => array( 'Оговорки и ограничения', _x( 'Hedges and caveats', 'Turgenev report', 'turgenev' ) ),
			'mix'      => array( 'Смешение стилей', _x( 'Mixed styles', 'Turgenev report', 'turgenev' ) ),
			'mistakes' => array( 'Просто ошибки', _x( 'Plain mistakes', 'Turgenev report', 'turgenev' ) ),
			'wrong'    => array( 'Сочетаемость', _x( 'Word collocation', 'Turgenev report', 'turgenev' ) ),
			'var'      => array( 'Разрыв шаблона', _x( 'Twisted set phrases', 'Turgenev report', 'turgenev' ) ),
			'gram'     => array( 'Проблемы с грамматикой', _x( 'Grammar problems', 'Turgenev report', 'turgenev' ) ),
			'misprint' => array( 'Грубые опечатки', _x( 'Gross typos', 'Turgenev report', 'turgenev' ) ),
			'logic'    => array( 'Логика текста и связки', _x( 'Text logic and connectives', 'Turgenev report', 'turgenev' ) ),
		);
	}
}
