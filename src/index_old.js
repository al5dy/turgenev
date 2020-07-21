const { __ } = wp.i18n;

document.addEventListener( 'DOMContentLoaded', () => {
	const panel = document.getElementById( 'turgenev-panel' );
	const balancePanel = document.getElementById( 'turgenev-balance' );
	const tableWrap = document.getElementById( 'turgenev-table' );
	window.TGEV = {
		checkRawContent: true,
		url: 'https://turgenev.ashmanov.com',
		contentTypeToggle: function ( e ) {
			const { checked } = e.target;
			this.checkRawContent = checked;
		},
		convertLabel: function ( label ) {
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
		},
		makeTable: function ( data ) {
			const details = data.details;
			let tableContent = '';

			tableContent +=
				'<div class="form-table-responsive"><table class="form-table">';

			if ( data.hasOwnProperty( 'error' ) ) {
				tableContent += `<tr><th>${ data.error }</th></tr>`;
			} else {
				const levelLabel = TGEV.convertLabel( data.level );
				tableContent += `<tr><th>${ __(
					'Overall risk',
					'turgenev'
				) }</th><td>${ levelLabel } <strong>(${
					data.risk
				})</strong></td></tr>
        <tr><th>${ __( 'Report', 'turgenev' ) }</th><td><a href="${
					this.url
				}/?t=${ data.link }" target="_blank">${ __(
					'More',
					'turgenev'
				) }</a></td></tr>
        `;
				for ( const prop in details ) {
					const label = TGEV.convertLabel( details[ prop ].block );
					const total = details[ prop ].sum;
					const params = details[ prop ].params;
					const link = details[ prop ].link;

					tableContent += `<tr><th class="tg-head">${ label } (${ total })</th><td class="tg-head"><a href="${
						this.url
					}/?t=${ link }" target="_blank">${ __(
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
		},
		checkBalance: function () {
			const xhr = new XMLHttpRequest();
			const data = `api=balance&key=${ turgenev_ajax.api_key }`;

			panel.style.opacity = '0.5';
			panel.style.cursor = 'default';
			panel.style.pointerEvents = 'none';

			xhr.open( 'POST', this.url, true );
			xhr.setRequestHeader(
				'Content-Type',
				'application/x-www-form-urlencoded; charset=UTF-8'
			);
			xhr.onload = () => {
				if ( xhr.status >= 200 && xhr.status < 300 ) {
					const response = xhr.response;
					if ( response ) {
						const responseJSON = JSON.parse( response );
						balancePanel.innerHTML = `${ responseJSON.balance }&nbsp;&#8381;`;

						if ( parseFloat( responseJSON.balance ) < 10 ) {
							balancePanel.style.color = '#ac2929';
							balancePanel.classList.add( 'turgenev-blink' );
						}

						panel.style.opacity = '1';
						panel.style.cursor = 'auto';
						panel.style.pointerEvents = 'auto';
					}
				}
			};
			xhr.send( data );

			return '...';
		},
		checkContent: function () {
			const xhr = new XMLHttpRequest();
			const content = tinymce.activeEditor.getContent();
			const _this = this;
			let contentClear = '';

			if ( this.checkRawContent ) {
				const tmp = document.createElement( 'div' );
				tmp.innerHTML = content;
				contentClear = tmp.textContent || tmp.innerText || '';
			} else {
				contentClear = content;
			}

			const data = `api=risk&more=1&key=${
				turgenev_ajax.api_key
			}&text=${ encodeURIComponent( contentClear ) }`;

			panel.style.opacity = '0.5';
			panel.style.cursor = 'default';
			panel.style.pointerEvents = 'none';

			xhr.open( 'POST', this.url, true );
			xhr.setRequestHeader(
				'Content-Type',
				'application/x-www-form-urlencoded; charset=UTF-8'
			);
			xhr.onload = () => {
				if ( xhr.status >= 200 && xhr.status < 300 ) {
					const response = xhr.response;
					if ( response ) {
						const responseJSON = JSON.parse( response );

						_this.makeTable( responseJSON );
						_this.checkBalance();

						panel.style.opacity = '1';
						panel.style.cursor = 'auto';
						panel.style.pointerEvents = 'auto';
					}
				}
			};
			xhr.send( data );
		},
	};

	if ( !! panel ) {
		// Check balance after load
		TGEV.checkBalance();
	}
} );
