fn argument_type_error(node: impl syn::spanned::Spanned,
) -> proc_macro::TokenStream {
  quote::quote_spanned! {
    node.span() => compile_error!("FFI arguments must be `u32`, `u64`, `i32`, \
      `i64`, `f32`, or `f64`");
  }.into()
}

#[proc_macro_attribute]
pub fn ffi(
  _args: proc_macro::TokenStream,
  input: proc_macro::TokenStream,
) -> proc_macro::TokenStream {
  let mut input_fn = syn::parse_macro_input!(input as syn::ItemFn);
  let signature = input_fn.sig.clone();
  let base_name = signature.ident.clone();
  let args = signature.inputs.clone();
  
  let private_name = syn::Ident::new(format!("__{base_name}").as_str(),
    base_name.clone().span());
  
  let mut arg_names: syn::punctuated::Punctuated<syn::Pat, syn::token::Comma> =
    syn::punctuated::Punctuated::new();
  
  input_fn.sig.ident = private_name.clone();
  
  let expected_argument_types: Vec<syn::Type> = vec![
    syn::parse_str("u32").unwrap(),
    syn::parse_str("u64").unwrap(),
    syn::parse_str("i32").unwrap(),
    syn::parse_str("i64").unwrap(),
    syn::parse_str("f32").unwrap(),
    syn::parse_str("f64").unwrap(),
  ];
  
  for pair in args.clone().into_pairs() {
    match pair.into_tuple().0 {
      syn::FnArg::Receiver(receiver) => return argument_type_error(receiver),
      syn::FnArg::Typed(pat_type) => {
        if !expected_argument_types.contains(&pat_type.ty) {
          return argument_type_error(pat_type.ty);
        }
        arg_names.push(*pat_type.pat);
      },
    }
  }
  
  proc_macro::TokenStream::from(quote::quote! {
    #input_fn
    
    #[automatically_derived]
    #[no_mangle]
    pub extern "C" fn #base_name(#args) -> u64 {
      // Variable declaration is mainly to declare type and trigger type
      // enforcement
      let result: FFIResult<_> = #private_name(#arg_names);
      
      match result {
        Err(code) => return 0x100000000 + code as u64,
        Ok(value) => return value.pack(),
      }
    }
  })
}
