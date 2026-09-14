( function () {
	const textarea = document.getElementById( 'content' );
	const params = new URLSearchParams( location.search );
	if ( params.has( 'fallback' ) ) { return; }
	window.tinymce.init( {
		target: textarea,
		base_url: '/tinymce',
		suffix: '.min',
		menubar: false,
		toolbar: false,
		statusbar: false,
		height: 220,
		setup( editor ) {
			editor.on( 'init', () => {
				if ( params.has( 'text' ) ) { editor.hide(); textarea.value = '<p>Text mode unsaved document.</p><p>Second paragraph.</p>'; }
			} );
		},
	} );
} )();
