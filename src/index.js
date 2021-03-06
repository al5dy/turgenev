import { registerPlugin } from '@wordpress/plugins';
import { PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/edit-post';
import { Icon, Button, PanelBody, FormToggle } from '@wordpress/components';
import { withState } from '@wordpress/compose';
import { Fragment } from '@wordpress/element';
const { select } = wp.data;
import { __ } from '@wordpress/i18n';
import './index.scss';

const PLUGIN_NAMESPACE = 'turgenev';
const pluginTitle = __( '"Turgenev"', 'turgenev' );
let checkRawContent = true;
const URL = 'https://turgenev.ashmanov.com';

const PluginIcon = () => (
	<Icon
		icon={
			<svg>
				<path d="M5 4v3h5.5v12h3V7H19V4z" />
			</svg>
		}
	/>
);

const checkBalance = () => {
	const xhr = new XMLHttpRequest();
	const data = `api=balance&key=${ turgenev_ajax.api_key }`;

	xhr.open( 'POST', URL, true );
	xhr.setRequestHeader(
		'Content-Type',
		'application/x-www-form-urlencoded; charset=UTF-8'
	);
	xhr.onload = () => {
		if ( xhr.status >= 200 && xhr.status < 300 ) {
			const response = xhr.response;
			if ( response ) {
				const responseJSON = JSON.parse( response );
				const balancePanel = document.getElementById(
					'turgenev-balance'
				);
				const workflowPanel = document.getElementById(
					'turgenev-workflow'
				);
				const topUpBtn = document.getElementById( 'turgenev-top-up' );

				balancePanel.innerHTML = `${ responseJSON.balance }&nbsp;&#8381;`;

				if ( parseFloat( responseJSON.balance ) < 10 ) {
					balancePanel.style.color = '#ac2929';
					balancePanel.classList.add( 'turgenev-blink' );
				}

				if ( parseFloat( responseJSON.balance ) <= 5 ) {
					if ( !! workflowPanel ) {
						workflowPanel.remove();
					}
					if ( !! topUpBtn ) {
						topUpBtn.style.display = 'inline-block';
					}
				} else {
					if ( !! workflowPanel ) {
						workflowPanel.style.display = 'block';
					}
					if ( !! topUpBtn ) {
						topUpBtn.remove();
					}
				}
			}
		}
	};
	xhr.send( data );

	return { __html: '...' };
};

const convertLabel = ( label ) => {
	switch ( label ) {
		case 'frequency':
			label = __( 'Frequency', 'turgenev' );
			break;
		case 'style':
			label = __( 'Style', 'turgenev' );
			break;
		case 'keywords':
			label = __( 'Keywords', 'turgenev' );
			break;
		case 'formality':
			label = __( 'Formality', 'turgenev' );
			break;
		case 'readability':
			label = __( 'Readability', 'turgenev' );
			break;
	}
	return label;
};

const makeTable = ( data ) => {
	const tableWrap = document.getElementById( 'turgenev-table' );
	const details = data.details;
	let tableContent = '';

	tableContent +=
		'<div class="form-table-responsive"><table class="form-table">';

	if ( data.hasOwnProperty( 'error' ) ) {
		tableContent += `<tr><th>${ data.error }</th></tr>`;
	} else {
		const levelLabel = convertLabel( data.level );
		tableContent += `<tr><th>${ __(
			'Overall risk',
			'turgenev'
		) }</th><td>${ levelLabel } <strong>(${ data.risk })</strong></td></tr>
        <tr><th>${ __( 'Report', 'turgenev' ) }</th><td><a href="${ URL }/?t=${
			data.link
		}" target="_blank">${ __( 'More', 'turgenev' ) }</a></td></tr>
        `;
		for ( const prop in details ) {
			const label = convertLabel( details[ prop ].block );
			const total = details[ prop ].sum;
			const params = details[ prop ].params;
			const link = details[ prop ].link;

			tableContent += `<tr><th class="tg-head">${ label } (${ total })</th><td class="tg-head"><a href="${ URL }/?t=${ link }" target="_blank">${ __(
				'More',
				'turgenev'
			) }</a></td></tr>`;

			for ( const paramProp in params ) {
				const name = params[ paramProp ].name;
				const value = params[ paramProp ].value;
				const score = params[ paramProp ].score;
				tableContent += `<tr><th>${ name }</th><td>${ value } (<strong>${ score }</strong>)</td></tr>`;
			}
		}
	}

	tableContent += `</table></div>`;

	tableWrap.innerHTML = tableContent;
};

const checkContent = () => {
	const xhr = new XMLHttpRequest();
	const content = select( 'core/editor' ).getEditedPostAttribute( 'content' );
	let contentClear = '';

	if ( checkRawContent ) {
		const tmp = document.createElement( 'div' );
		tmp.innerHTML = content;

		contentClear = tmp.textContent || tmp.innerText || '';
	} else {
		contentClear = content;
	}

	contentClear = contentClear.trim();

	if ( contentClear ) {
		const data = `api=risk&more=1&key=${
			turgenev_ajax.api_key
		}&text=${ encodeURIComponent( contentClear ) }`;
		const panel = document.getElementById( 'turgenev-panel' );

		panel.style.opacity = '0.5';
		panel.style.cursor = 'default';
		panel.style.pointerEvents = 'none';

		xhr.open( 'POST', URL, true );
		xhr.setRequestHeader(
			'Content-Type',
			'application/x-www-form-urlencoded; charset=UTF-8'
		);
		xhr.onload = () => {
			if ( xhr.status >= 200 && xhr.status < 300 ) {
				const response = xhr.response;
				if ( response ) {
					const responseJSON = JSON.parse( response );

					makeTable( responseJSON );
					checkBalance();

					panel.style.opacity = '1';
					panel.style.cursor = 'auto';
					panel.style.pointerEvents = 'auto';
				}
			}
		};
		xhr.send( data );
	} else {
		const tableWrap = document.getElementById( 'turgenev-table' );
		tableWrap.style.marginLeft = '0';
		tableWrap.style.marginRight = '0';
		tableWrap.innerText = __(
			'Failed to parse content. Add content to the editor or click in the editable area.',
			'turgenev'
		);
	}
};

const Balance = () => (
	<p>
		{ __( 'Current balance:', 'turgenev' ) }{ ' ' }
		<strong
			id="turgenev-balance"
			dangerouslySetInnerHTML={ checkBalance() }
		/>
	</p>
);

const MyButton = () => (
	<Button isSecondary onClick={ checkContent }>
		{ __( 'Check content', 'turgenev' ) }
	</Button>
);

const Result = () => <div id="turgenev-table" />;

const ContentTypeToggle = () => (
	<p>
		<MyFormToggle />
		{ __( 'Check raw content', 'turgenev' ) }
		<small>
			{ __(
				'If the option is enabled, then the content will be checked without HTML tags. Only plain text.',
				'turgenev'
			) }
		</small>
	</p>
);

const MyFormToggle = withState( {
	checked: true,
} )( ( { checked, setState } ) => (
	<FormToggle
		checked={ checked }
		onChange={ () => {
			checkRawContent = ! checked;
			setState( ( state ) => ( { checked: ! state.checked } ) );
		} }
	/>
) );

const MyPanel = () => (
	<PanelBody>
		<div id="turgenev-panel">
			<Balance />
			<div id="turgenev-workflow">
				<ContentTypeToggle />
				<MyButton />
				<Result />
			</div>
			<a
				href="https://turgenev.ashmanov.com/?a=pay"
				className="button"
				id="turgenev-top-up"
				target="_blank"
			>
				{ __( 'Top-up balance', 'turgenev' ) }
			</a>
		</div>
	</PanelBody>
);

const TurgenevSidebar = () => (
	<Fragment>
		<PluginSidebarMoreMenuItem
			target="turgenev-sidebar"
			icon={ <PluginIcon /> }
		>
			{ pluginTitle }
		</PluginSidebarMoreMenuItem>
		<PluginSidebar name="turgenev-sidebar" title={ pluginTitle }>
			<MyPanel />
		</PluginSidebar>
	</Fragment>
);

registerPlugin( PLUGIN_NAMESPACE, {
	render: TurgenevSidebar,
	icon: <PluginIcon />,
} );
